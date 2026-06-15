## Problem

Two parallel "authorized codes" stores exist for each client and they don't agree:

- **`client_billing_codes` table** (the 1056 ledger) — used by header chips, Billing tab, scheduling/EVV authorization checks. For Johnny: DSI, HHS, SEI, SLH, SLN.
- **`clients.authorized_dspd_codes` / `clients.job_code` (legacy array column)** — written by the "Authorized DSPD billing codes" multiselect on the Care tab and still read by ~30 files (scheduling, today-shift, EVV punch pad, whiteboard, caseload, etc.). For Johnny: SLH, DSG.

DSPD rule per project brain: no auth row in `client_billing_codes` → no shift, no billing. The legacy array must NOT be authoritative.

## Fix (one source of truth = `client_billing_codes`)

### 1. Replace the Care-tab multiselect with a read-only mirror

In `src/routes/dashboard.clients.tsx`:
- Delete `CareBillingCodesEditor` (the `DspdCodesMultiSelect` + Save button).
- Replace it with a read-only chip strip that renders the same `billingCodes` array already passed to the header, plus the existing "Open Billing" link-out. Adding/removing/rating codes happens in one place: the Billing editor (`/dashboard/billing/$clientId`), which already writes `client_billing_codes`.
- This kills the bad write path that was producing the SLH+DSG mismatch.

### 2. Sync trigger: `client_billing_codes` → `clients.authorized_dspd_codes` + `clients.job_code`

Add a Postgres trigger (migration) on `client_billing_codes` (AFTER INSERT/UPDATE OF service_code/DELETE) that recomputes:

```
UPDATE public.clients
SET authorized_dspd_codes = sub.codes,
    job_code              = sub.codes
FROM (
  SELECT array_agg(DISTINCT service_code ORDER BY service_code) AS codes
  FROM public.client_billing_codes
  WHERE client_id = <affected>
) sub
WHERE clients.id = <affected>;
```

Plus a one-time backfill in the same migration so every existing client's legacy arrays match their current `client_billing_codes` rows immediately.

Net effect: every existing consumer that still reads `client.job_code` / `client.authorized_dspd_codes` (scheduling, EVV punch pad, today-shift, caseload, whiteboard, etc.) automatically sees the same list as the Billing tab and the header chips — no code changes needed to those ~30 files in this turn. The legacy fields become a cached projection of the authoritative table.

### 3. Out of scope (intentionally not in this turn)

- Migrating the ~30 readers off `job_code`/`authorized_dspd_codes` to `useClientBillingCodes` directly. The sync trigger makes that purely a cleanup pass — safe to do incrementally later.
- Any change to billing-rate logic, EVV gating, or scheduling rules.
- The "Living-arrangement conflict (advisory)" banner — it already reads from `client_billing_codes`, no change needed.

## Verification

- Reload Johnny's Care tab → "Authorized DSPD billing codes" section now shows DSI, HHS, SEI, SLH, SLN (matching header chips and Billing tab). The standalone multiselect is gone; add/remove happens via "Open Billing".
- DB check: `clients.authorized_dspd_codes` for Johnny equals `array_agg(service_code)` from `client_billing_codes` for Johnny.
- Add a code via Billing editor → trigger fires → header chips, Care card, and any legacy-array consumer all update on next refetch.
- Delete a code via Billing editor → same, list shrinks everywhere.

## Files touched

- `src/routes/dashboard.clients.tsx` — remove `CareBillingCodesEditor` usage + definition; render read-only chip list inside the existing `CareSectionShell`.
- New migration — trigger function + trigger on `client_billing_codes` + one-time backfill UPDATE on `clients`.
