## Day Program Billing Model — DSG / DSP / DSI / MTP

Bring HIVE's billing engine in line with DSPD SOW Art. 7, 9, 13 (eff. 7/1/26). Day-program codes bill **per client per day** off a **Day Program Session**, never off staff hours — same firewall pattern as RHS. Rates for DSG/DSP/HHS on the fee schedule are **caps**; the actual per-client rate comes from the RFS-set authorization on `client_billing_codes.rate_per_unit`.

### 1. Code catalog corrections (`src/lib/`)

- **`service-billing.ts`**
  - `DAILY_SERVICE_CODES`: keep DSG; remove standalone "DSP" handling and instead introduce mode-aware helper (DSP can be quarter-hour OR daily — see §3).
  - Add `MTP` to `DAILY_SERVICE_CODES` (flat daily).
  - `VARIABLE_RATE_CODES`: add `DSG`, `DSP` (both modes), keep HHS/RHS/DSI/SEI. MTP stays **flat** (NOT variable) — $21.13/day from code, never per client.
  - `NON_CLOCKABLE_CODES`: add `MTP` (transport-only, not a labor punch driver; staff log it on the session's transport block, not via clock-in).
- **`evv-codes.ts`**: rename DSP label to "DSP — Day Supports Partial/Extended (qtr-hr or daily)". No EVV change.
- New **`src/lib/day-program-billing.ts`** — single source of truth:
  - `DAY_PROGRAM_CODES = { DSG, DSP, DSI, SED }` (transportable subset: DSG/DSP/SED).
  - `MTP_ELIGIBLE_CODES = { DSG, DSP, SED }` (explicitly NOT DSI — SOW 13.1, 13.4(2)).
  - `dspModeForMinutes(min)` → `"qtr_hr" | "daily_extended"` based on session length (≤ ~4h → qtr-hr; ~7–10h → daily extended; in-between flagged for review).
  - `dsiTierForMinutes(min)` → 1..6 hr tier and matching cap.
  - `RATE_CAPS` — DSG 246.61, DSP-qtr 10.25, DSP-daily 403.39, DSI tiers, MTP 21.13.
  - `validateClientRateAgainstCap(code, mode, rate)` for authorization editor.

### 2. Schema additions (single migration, with GRANTs + RLS)

```text
day_program_sessions
  id, organization_id, session_date, location_id (FK teams or licensed site),
  service_code (DSG|DSP|DSI|SED), start_time, end_time, notes, created_by, timestamps

day_program_attendance      -- one row per enrolled client per session
  id, session_id, client_id, attended bool, arrival_time, departure_time,
  activity_note, billed_code (DSG|DSP|DSI|SED), billed_mode (daily|qtr_hr),
  billed_units numeric, billed_rate numeric (snapshot from client auth),
  cap_snapshot numeric, override_reason, timestamps

day_program_session_staff   -- labor/attendance only, NEVER drives billing
  id, session_id, staff_id, clock_in, clock_out

day_program_transport       -- optional per-client transport block
  id, attendance_id (unique), pickup_location, pickup_time,
  dropoff_location, dropoff_time, transport_staff_id,
  mtp_billed bool, mtp_block_reason text, timestamps
```

RLS: org-scoped via existing `is_org_member` / `is_org_admin_or_manager`. GRANTs to `authenticated` + `service_role`. View `day_program_billable_v` computes per-client per-day units + dollar amount honoring caps and the MTP firewall.

### 3. Billing emitter rules (encoded in the view + server fn)

| Code | Emit unit | Rate source | Hard rules |
|---|---|---|---|
| DSG | 1 daily unit per attending client per session day | `client_billing_codes.rate_per_unit` for DSG, validated ≤ 246.61 | Session length ~6h typical; flag monthly avg drift for DSG↔DSP review (SOW 7.6) |
| DSP (qtr-hr) | `computeEntryUnits(arrival, departure)` per client | client auth rate ≤ 10.25 | Only when session length ≤ ~4h |
| DSP (daily) | 1 daily unit per attending client | client auth rate ≤ 403.39 | Only when session length ~7–10h |
| DSI | 1 daily unit, tier by **actual hours delivered** | client auth rate ≤ tier cap (1h..6h) | Transport bundled — block MTP same day |
| MTP | 1 daily unit per client per date transported | **flat** $21.13 (NOT client auth) | **Firewall:** must have a DSG/DSP/SED billable unit same client/date or row is non-billable with `mtp_block_reason` |

The view enforces the MTP firewall in SQL (LEFT JOIN against billable DSG/DSP/SED for that client/date; `mtp_billed=false` and reason populated when missing).

### 4. UI surface

- **Scheduling → new "Day Program" tab** alongside Homes/Teams: create a session (date, licensed site, code, time window, enrolled clients, assigned staff). Sessions don't show in the shift-conflict engine the same way 1:1 shifts do — staff rows are labor-only.
- **Attendance roster** inside a session: per-client row with attended toggle, arrival/departure, activity note, optional transport block (pickup/dropoff loc + time, transport staff). Live unit/$ preview using client auth + cap.
- **Client → Billing codes editor**: when adding DSG/DSP/DSI, require `rate_per_unit` and validate ≤ cap (with cap shown inline + RFS rationale field). MTP code never asks for a per-client rate.
- **Billing review (`dashboard.billing.*`)**: new "Day Program" group with DSG/DSP/DSI/MTP totals; MTP rows that were blocked render in a "Not billable — no DSG/DSP attendance" subsection with the blocking reason.
- **Compliance flags** (Nectar Scrubber/Sentinel):
  1. Session location must be a licensed/certified day site, NOT a residence (SOW 7.4, 7.5).
  2. Client missing RFS rate, or rate > cap.
  3. Monthly-avg session length suggests DSG↔DSP switch — file SC follow-up.
  4. MTP attempted on a DSI day → soft-blocked with explanation.
  5. DSP session length in the ambiguous 4–7h band → reviewer chooses mode with reason.

### 5. Out of scope this pass

- SED group-employment transport (MTP allowed) is wired through the same engine but full SED program UI lives in a later increment.
- No changes to RHS / HHS / SLH / SLN engines.
- No changes to staff payroll math — day-program staff still clock in for labor; their hours never affect day-program client billing.

### Technical notes

- Migration order respects: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY for all four new tables, plus the view.
- All client billing dollar math goes through `computeEntryUnits` (for DSP qtr-hr) or per-row daily multiplier; never sum hours then round (project rule).
- `day_program_billable_v` is the only thing the billing UI reads for these codes; raw attendance rows are never priced client-side.
- `rate_per_unit` validation lives both in the editor (UX) and in a `BEFORE INSERT/UPDATE` trigger on `client_billing_codes` for DSG/DSP/DSI (defense in depth).

Reply "go" and I'll implement, or tell me what to adjust (e.g. tighten the DSG↔DSP threshold, change session location rules, defer the view, etc.).