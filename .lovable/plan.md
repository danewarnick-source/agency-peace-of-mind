# Fix empty Staff dropdown in scheduler

## Root cause

`src/hooks/use-schedule-preview.ts` loads staff with:

```ts
supabase.from("profiles").select(...).eq("tenant_id", orgId!)
```

`profiles.tenant_id` is `NULL` for every row in this database — org-to-user membership lives in `organization_members(organization_id, user_id, role)`. The query returns 0 rows, so the staff list is built solely from `staff_id`s already present on existing shifts, each falling back to the literal label `"Staff"`. Result: the dropdown shows duplicate `"Staff"` entries and no real members (e.g., Dane, Tom, etc.) can be picked.

Brandon Johnson in the screenshot is a **client** (Caseload Assignment Center lists clients), not a staff member, so he correctly doesn't belong in the Staff dropdown. The fix below restores every real org member to the dropdown.

## Change

File: `src/hooks/use-schedule-preview.ts` — staff load only.

1. Query `organization_members` for the current org to get every `user_id` (any role).
2. Fetch matching rows from `profiles` by `id IN (user_ids)`.
3. Build the staff map from those profiles (same name fallback as today).
4. Keep the existing safety net that adds any `staff_id` from shifts that isn't in the member list, so legacy shifts still render.

No schema changes, no RLS changes, no edits to scheduled_shifts, EVV, billing, or pay.

## Out of scope

- Caseload-aware ordering (sorting staff assigned to the selected client first). Not requested — leave for later.
- Filtering staff by role. Per the user's note ("If client is assigned to staff, they should show as option for scheduling"), the dropdown should be permissive; admins/managers/employees all remain selectable. Per‑client gating is enforced elsewhere via `staff_assignments`.

## Guardrails

- One file touched.
- No mutations or migrations.
- Same return shape (`StaffRow[]`) — no caller changes needed.
