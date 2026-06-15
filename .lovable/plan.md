## Bug
Removed billing codes reappear after reload because:
1. `useClientBillingCodes` returns every row (incl. soft-closed ones) → editor + header chip + EVV/scheduler dropdowns all see closed codes.
2. The DB trigger `sync_client_authorized_codes_from_billing` (a) doesn't fire when a row is soft-closed (only watches `UPDATE OF service_code, client_id`), and (b) aggregates every row regardless of `service_end_date` → `clients.authorized_dspd_codes` / `job_code` keep removed codes.

## Fix (one fix, two places, both must agree on "open = `service_end_date IS NULL OR service_end_date > CURRENT_DATE`")

### 1. Migration — trigger + backfill
Rewrite `public.sync_client_authorized_codes_from_billing()` so its aggregate filters to open rows only, distinct on `service_code`. Recreate `trg_sync_client_authorized_codes` to also fire on `UPDATE OF service_end_date` (keep `service_code`, `client_id`, plus INSERT/DELETE). One-time backfill: recompute `clients.authorized_dspd_codes` and `clients.job_code` from open rows for every client; clients with no open rows get `ARRAY[]::text[]`.

Result: closing a code immediately drops it from the EVV clock-in dropdown and the scheduler (both read `clients.job_code` / `authorized_dspd_codes` paths via this sync).

### 2. Frontend read — `src/hooks/use-client-billing-codes.tsx`
In `useClientBillingCodes` (single-client hook) post-filter the returned array to rows where `service_end_date == null || service_end_date > today` (today = local `YYYY-MM-DD`). Do not touch `useAllClientBillingCodes` — admin/520 views need history.

This single hook feeds: profile editor `currentCodes`, profile "Service codes" summary chip, EVV `punch-pad` code list, scheduler `shift-editor` code list, and `cap-threshold-modal` — all of which want "currently authorized" semantics, matching the user's stated expectation.

Also dedupe the derived string list in `src/routes/dashboard.clients.tsx` line 602 with `Array.from(new Set(...))` so duplicate service_code rows (open + historically re-added) render once in the chip and editor.

## Out of scope (explicitly untouched)
- Billing tab's own query in `dashboard.clients.$clientId.tsx` (reads full history — correct).
- `useAllClientBillingCodes`, billing math, EVV rules, any other component, table, or feature.
- No row deletes; closed rows remain for billing history.

## QA
Open a client → remove a code → Save → navigate away → return: code gone from editor + header summary. Check EVV clock-in client dropdown and scheduler shift-editor code dropdown: code gone. Add a code: still works. Billing tab (1056 history) still shows the closed row with its end-date.
