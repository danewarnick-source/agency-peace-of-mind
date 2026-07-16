## Fix blank Medicaid IDs on historical timesheet imports

Right now `importHistoricalTimesheets` writes every row with `utah_medicaid_provider_id: ""` and `utah_medicaid_member_id: ""`. Fill both from records already on file, and reject rows where either is missing instead of saving a blank.

### Where the IDs come from
- **Provider ID** → `organizations.dhhs_provider_id` for the import's `organization_id` (single lookup).
- **Member ID** → `clients.medicaid_id` for each matched `client_id` (already fetched in the same handler).

### Changes to `src/lib/smart-import-timesheets.functions.ts`
1. Extend the `organizations` fetch: alongside verifying the org, select `dhhs_provider_id`. If it's null/blank, fail the whole import with a clear message ("Set the agency's DSPD provider ID before importing timesheets") — no partial commit.
2. Change the existing `clients` select from `"id"` to `"id, medicaid_id"` and build a `Map<clientId, medicaid_id | null>` instead of the current `Set`.
3. In the per-row loop, after the existing staff/client/date checks, look up the client's `medicaid_id`. If blank/null, push to `rejected` with reason `"client is missing a Utah Medicaid member ID"` and skip — do NOT insert.
4. In the insert payload, replace the two `""` literals with the real `dhhs_provider_id` and the row's `medicaid_id`.

### Behavior after the fix
- Every inserted `evv_timesheets` row carries the real provider + member IDs.
- Rows for clients without a Medicaid ID on file are surfaced in the wizard's existing `rejected` list (same shape as today's "client not in organization" rejections) so the admin knows exactly which client records to complete before re-importing.
- Orgs without a `dhhs_provider_id` get a single upfront error instead of silently importing blanks.

### Out of scope
- UI copy in the wizard (existing rejected-row rendering already handles new reasons).
- Backfilling the blanks already written by previous imports — separate task if wanted.
- No schema changes.
