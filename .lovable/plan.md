## Problem

Upload shows toast "Still loading staff and clients — try again in a moment." because `peopleQ.data` is undefined. The query at line 199 tries to PostgREST-embed `organization_members` → `profiles` via `profiles:profiles!inner(...)`. Per the project's known landmines, there is no FK between `organization_members` and `profiles` (both key off `auth.users.id`), so this embed errors out. The query never resolves with data, and the guard on line 366 keeps firing.

Additionally, when the query does error, the wizard shows no feedback — the user only sees the "still loading" toast, so the real cause is invisible.

## Fix

In `src/components/smart-import/timesheets/timesheets-import-wizard.tsx`, `peopleQ.queryFn`:

1. Drop the embed. Fetch `organization_members` selecting only `user_id` (filter `active=true`, org-scoped).
2. Fetch `profiles` in a second query with `.in("id", userIds)` selecting `id, first_name, last_name, full_name`.
3. Join in JS to build the `staff: Person[]` list, same shape as today. Clients query stays as-is.

Also improve the failure signal so this never hides again:
- In `onPickFile`, when `!peopleQ.data`, if `peopleQ.isError` show the actual error message; if still loading, keep the current wording.

Nothing else changes — review flow, template validation, duplicate check, and commit path are untouched.

## Files

- `src/components/smart-import/timesheets/timesheets-import-wizard.tsx` — rewrite `peopleQ.queryFn` to two-step fetch + JS join; refine the guard's error toast.