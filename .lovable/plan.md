# Duplicate table pairs: what to do

Verified current row counts and code references for every overlapping group. Nothing here is "obviously dead" the way the 15 dropped tables were — each duplicate still has code pointing at it, so the work is deciding a winner per pair and retiring the loser deliberately, not a bulk drop.

## Group-by-group recommendation

### 1. Shifts — `evv_timesheets` (135 rows) vs `general_shifts` (0 rows)
`general_shifts` is referenced from 5 places (monthly grid, pay-period hook, active shift bar, records tab, `use-general-shift`) but has never held a row; every real shift lives in `evv_timesheets`.
Action: treat `evv_timesheets` as the single shift model. Remove the `general_shifts` read paths from those 5 files (they currently return empty arrays anyway), then drop the table in a follow-up migration once the UI no longer references it.

### 2. Audit sharing — `audit_packets*` vs `audit_packages*` vs `auditor_shares*` (all 0 rows)
Three parallel implementations of "assemble evidence and share it with an auditor":
- `audit_packets` + `audit_packet_items` — internal packet builder used by `/dashboard/audit`
- `audit_packages` + `_files/_folders/_subjects/_access` — external auditor portal
- `auditor_shares` + `_items` + `_access_log` — link-based sharing

Recommendation: keep `audit_packets` (the one wired to the visible `/dashboard/audit` route) as the packet model, and keep `auditor_shares` as the delivery/sharing layer on top of it. Retire the `audit_packages*` family: it is the least-reachable of the three and duplicates both. Since all three are empty, retiring costs no data.
Action: delete `audit-portal.functions.ts`, `audit-package-data.ts`, `audit-package-access.ts` and any routes that import them, then drop the 5 `audit_package*` tables.

### 3. Certifications — `certifications` (0) vs `external_certifications` (0) vs `host_home_certifications` (1)
These are not true duplicates: `certifications` is internally issued/verifiable (backs `/verify/$code`), `external_certifications` is staff-uploaded outside credentials, `host_home_certifications` is a host-home site certification. Different domains.
Action: keep all three. No change beyond documenting the distinction.

### 4. Training — `courses`/`course_modules`/`lessons` (21/76/364 rows) vs `hive_training_*` (3–4 rows)
Also not duplicates: the first is the in-app LMS with real content; `hive_training_*` is the purchasable catalog/seat/order marketplace.
Action: keep both. Optionally surface the LMS courses inside the HIVE training catalog later so staff see one list.

### 5. `assignment_map` (5 rows)
Smart-import-only mapping table, no duplicate. Keep.

## Suggested order of work
1. Strip `general_shifts` reads (safe, no data).
2. Strip the `audit_packages*` code path.
3. One migration dropping `general_shifts` and the 5 `audit_package*` tables, after the build is green with no references.

## Technical notes
- All drops target empty tables, so no backfill or data migration is needed.
- `src/integrations/supabase/types.ts` is regenerated after the migration; expect follow-up type fixes anywhere the removed tables were referenced.
- Build must be run so `src/routeTree.gen.ts` regenerates if any route file is deleted.
