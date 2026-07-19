## Diagnosis

The toast "JSON object requested, multiple (or no) rows returned" is a PostgREST error from `.maybeSingle()` when the query returns more than one row. In `src/lib/employee-face-sheet.ts` (lines 94-98), the loader does:

```ts
sb.from("organization_members")
  .select("id, role, active, organization_id")
  .eq("user_id", staffId)
  .maybeSingle();
```

There is no organization filter. Jake Probert (and any admin/staff who belongs to more than one org — TNS FAKE plus other tenants they've been added to) has multiple `organization_members` rows for the same `user_id`, so `maybeSingle()` throws and the PDF never builds. The dropdown Preview / Download / Print / Ship all funnel through this same `loadEmployeeSheetData` path, so every action from the Face Sheet button fails the same way.

## Fix

Scope the `organization_members` query to the caller's current organization before calling `maybeSingle()`.

1. In `src/lib/employee-face-sheet.ts` `loadEmployeeSheetData`, resolve the caller's current org id via the existing `get_current_org_id()` RPC (already used elsewhere in the codebase for this exact "which org am I acting in" question).
2. Add `.eq("organization_id", currentOrgId)` to the `organization_members` lookup, keeping `.maybeSingle()`. This guarantees at most one row and enforces that the face sheet only builds for an employee in the org the user is currently viewing — matching the RLS scope the rest of the employee profile already uses.
3. Keep the existing "Employee not found in your organization" error for the null case.

No other code paths change. The client Face Sheet is unaffected (different query shape).

## Verification

- Reopen Jake Probert's profile in TNS FAKE and click Face Sheet → Preview: the PDF should open in a new tab with no toast.
- Try Download, Print, and Ship to HR docs from the same dropdown to confirm all four actions succeed.
- Spot-check a single-org employee to confirm nothing regressed.
