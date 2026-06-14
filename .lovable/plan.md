# HIVE — Information Architecture cleanup (A → E)

Single principle reinforced everywhere: records live ONCE in their existing tables. Each step below only adds new **views** and **filters** over data that already exists. No new shift/log/incident/summary tables. No changes to billing math, EVV CSV, HHS/protected logic, or the staff (DSP) nav.

Each step ships independently and is testable on its own.

---

## A. Approved-EVV searchable archive (real audit gap)

**Goal.** One screen: "show me every approved EVV shift, filtered by staff / client / service code / date range / home / billing status, exportable to CSV."

**Where it lives.** New tab inside Documentation hub: `tab=evv-archive` (sibling of the existing EVV & timesheets tab, not nested inside it). Existing Pending / Needs-review / Reconciliation / Archive tabs stay where they are — this is the cross-cutting search layer above them.

**Data source.** `evv_timesheets` rows where `status = 'Approved'` (already exists). No new table. Reads only.

**Filters (v1, all four user-confirmed groups):**
- Staff (multi-select from org staff)
- Client (multi-select from org clients)
- Service code (multi-select from active `service_codes`)
- Date range (clock_in date)
- Home / team (`teams.id` via shift's home assignment)
- Billing status: derive from existing `billing_submissions` / `evv_export_records` join — Billed / Held / Unbilled. No new state.

**Output.**
- Paginated table: date, staff, client, code, in/out, units, home, billing status.
- CSV export of the *currently filtered* set (reuses existing CSV builder pattern from `utah-export-dialog.tsx` — wrap into a shared `buildApprovedEvvCsv(rows)` util so the existing Utah export is untouched).
- Each row links to the existing shift detail route.

**Reuse on profiles.** Same query function, pre-filtered by `clientId` or `staffId`, becomes the "Shifts" tab in steps B and C — so the search infra built here is the foundation for the hubs.

---

## B. Client profile = full record hub (new route)

**New route.** `src/routes/dashboard.clients.$clientId.tsx` — the consolidated profile/record hub.

- Workspace (`/dashboard/workspace/$clientId`) **stays** as day-of-care for staff.
- The new profile is the admin/manager record hub. Cross-link both directions ("Open workspace" / "Open profile").

**Tabs (all surface existing data — no new storage):**
1. **Overview** — demographics, status, current home/team, SCs, payor, intake completion bar (reads `client_intake_completion`).
2. **Plan & goals** — PCSP, behavior support, weekly targets (reads existing).
3. **Billing codes** — embeds the existing per-client view of `client_billing_codes` (read-only here; edit still in `/dashboard/client-billing-codes`).
4. **Shifts (EVV)** — uses the A-archive query pre-scoped to `client_id`.
5. **Daily logs** — `daily_logs` filtered by client.
6. **Incidents** — `incident_reports` + `hhs_incident_reports` filtered by client.
7. **Summaries** — `client_progress_summaries` for this client; deep-links to Summaries portal.
8. **Host-home cert** (only if client lives in a host home) — `host_home_certifications` + `host_home_cert_concerns`.
9. **Deadlines** — pre-filtered view of the deadlines hook by `client_id`.
10. **Documents** — `client_documents`.

**Discoverability.** Clients hub directory row → "Open profile" goes here; existing "Open workspace" link preserved.

---

## C. Staff profile = full record hub

**Route.** `src/routes/dashboard.employees.$staffId.tsx` already exists — extend, don't replace. Add the missing record-hub tabs alongside what's there.

**Tabs:**
1. **Overview** — role, hire date, staff type, home assignments.
2. **Shifts** — A-archive query scoped to `staff_id`.
3. **Certifications** — `certifications` + `external_certifications` (already partly present; consolidate).
4. **Trainings** — `training_completions`, `course_assignments`, `staff_other_assignments`, CE ledger.
5. **Incidents filed** — `incident_reports` where filer = this staff.
6. **HR / onboarding docs** — `hr_documents` (respect existing access log + RLS).
7. **Deadlines** — pre-filtered to this staff.

**Reuse rule.** Every tab is a pre-filtered call into the same hook/query used by the corresponding type-view. No duplicated logic.

---

## D. Documentation page simplification (type-view, cleanly)

Documentation hub becomes the canonical TYPE view. One tab = "all X, searchable."

**Tab set after cleanup:**
- Review (existing landing — keep)
- EVV & timesheets (existing operational queue — keep)
- **EVV archive** (new from step A)
- Incidents (existing — keep)
- Summaries (link out / embed Summaries portal as type-view)
- Forms (existing)
- Host home (existing)
- Audit (existing, includes HRC sub-section already)

**Removed/merged:** any duplicated "records desk" / nested reconcile pages whose function is fully covered above. Behaviour-preserving: nothing deleted in this step that hasn't been verified as redundant in step E's list.

---

## E. Dead-route cleanup — produce verified list ONLY (no deletions)

**Deliverable.** A markdown report at `docs/ORPHAN_ROUTES.md` containing, for every file in `src/routes/`:

- Route path
- Referenced by nav? (grep nav config + hub-shell tabs)
- Referenced by `<Link to=...>` / `navigate({ to: ... })` / `router.navigate` / `redirect({ to: ... })` anywhere in `src/`
- Referenced by dynamic string concatenation (best-effort grep for the path literal)
- Verdict: **LIVE** / **LIKELY ORPHAN** / **NEEDS HUMAN REVIEW**
- Suspected superseder (e.g. `dashboard.billing.*` → `dashboard.hub.finances`)

Categories to scrutinize per the audit you described:
- `dashboard.billing.*` vs `dashboard.hub.finances`
- `dashboard.scheduling` / `dashboard.assignments` / `dashboard.schedule` vs `schedule-preview`
- `dashboard.team` / `dashboard.teams` / `dashboard.roles` / `dashboard.hr-admin` vs `dashboard.hub.employees`
- Multiple compliance/records desks (`dashboard.records-desk`, `dashboard.compliance-desk`, etc.)
- Overlapping training systems (`dashboard.training.*`, `dashboard.courses.*`, `dashboard.tracks.*`, `dashboard.programs.*`)

**No file deletions in this step.** Output the report; you approve removals in a follow-up turn.

---

## Sequencing & guardrails

Order: **A → B → C → D → E**. Each step is one PR's worth of work.

Hard guardrails enforced throughout:
- Records surfaced, never duplicated in storage. No new shift/log/incident/summary tables.
- Don't touch billing math, EVV CSV byte output, HHS host-home protected logic, conflict engine.
- Staff (DSP) nav unchanged (verify only: clock-in/out is reachable from Caseload and Schedule).
- All new queries respect existing RLS — no service-role bypass, no new SECURITY DEFINER functions.
- Convention: hive-conventions + dspd-domain skills apply (unit math via `computeEntryUnits`, EVV-mandated set via `src/lib/evv-codes.ts`, daily-rate set via `src/lib/service-billing.ts`).

## Technical notes (for me, not the user)

- Build a shared `useApprovedEvvShifts({ clientIds?, staffIds?, codes?, homeIds?, from, to, billingStatus? })` hook. Reused by A's archive page, B's client Shifts tab, C's staff Shifts tab.
- Extract `buildApprovedEvvCsv(rows)` from existing Utah export; leave the Utah export's existing call site untouched.
- Billing-status derivation: left-join `evv_export_records` (presence → Billed), then check `billing_submissions` holds/warnings (`billing_submission_warnings`) → Held; otherwise Unbilled. All read-only.
- New client profile route is additive; the workspace route stays — both link to each other.
- Employees route already exists; only new tab components are added.
- Documentation hub edits limited to tab list in `dashboard.hub.documentation.tsx` plus the new EVV-archive tab component.
- Orphan-route report uses ripgrep over `src/` for each candidate route path; flags catch-all `$` and dynamic `$param` segments specially as NEEDS HUMAN REVIEW.

Reply **"go"** (or "start with A") and I'll build step A first.
