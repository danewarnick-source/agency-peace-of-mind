## Goal
Make `/dashboard/scheduling` open reliably and finish the scheduling feature so it works with the existing backend data model.

## Plan
1. **Fix why the page appears unavailable**
   - Verify the dashboard route renders the scheduling child route correctly in preview.
   - Check for redirects or guard behavior that can make the page seem like “not found” even when the route exists.
   - Keep the route tree generation untouched unless a true registration issue is found.

2. **Align the scheduling page with the actual backend schema**
   - Update the scheduling page so its queries and writes match the current database columns and relationships.
   - Remove references to fields that do not exist yet in the database.
   - Preserve the existing UI structure and intended scheduling workflows where possible.

3. **Add any missing database structure needed by the page**
   - Create a migration only for genuinely missing scheduling fields needed by the feature.
   - Keep access rules secure so organization members only access their organization’s scheduling data.
   - Ensure the backend remains compatible with the rest of the app’s organization model.

4. **Finish the scheduling feature behavior end to end**
   - Make monthly loading, create, edit, delete, duplicate, filtering, and publish actions work against live data.
   - Keep permission checks in place so only authorized users can manage scheduling.
   - Avoid unrelated UI or logic changes outside the scheduling route and the minimal supporting backend pieces.

5. **Validate in preview**
   - Re-test `/dashboard/scheduling` in the browser.
   - Confirm the page loads instead of appearing unavailable.
   - Confirm the main scheduling actions work without query or permission errors.

## Key findings from exploration
- `src/routeTree.gen.ts` already includes `/dashboard/scheduling`, so the issue is not a missing generated route entry.
- The scheduling page currently queries `scheduled_shifts`, `clients`, and `profiles` directly from the browser.
- The `scheduled_shifts` table exists, but the page writes a `created_by` field that is not present in the current table.
- The table also has no foreign keys for `staff_id` or `client_id`, so relational selects may not behave as expected.
- The page filters clients by `status = 'Active'`, but the current `clients` table uses `account_status`, so that query is mismatched.
- The `profiles` table currently does not expose an `organization_id` column, so the staff query in the page is also mismatched.

## Technical details
- Frontend files likely involved:
  - `src/routes/dashboard.scheduling.tsx`
  - possibly `src/routes/dashboard.tsx` only if access or nav behavior needs a targeted fix
- Backend work likely involved:
  - a new migration to complete `scheduled_shifts` and/or adjust how staff/client relationships are resolved
- Validation approach:
  - preview route test
  - live data query verification
  - create/edit/publish flow smoke test