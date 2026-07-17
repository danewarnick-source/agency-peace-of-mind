## Problem

In `src/components/records/records-tab.tsx` (lines 133–152), `staffOptionsQ` builds the staff name map with:

```ts
.from("organization_members")
.select("user_id, profiles:user_id(first_name, last_name)")
```

There's no FK between `organization_members` and `profiles` (both key off `auth.users.id`), so the nested embed silently returns `null` for every row. The fallback is `user_id.slice(0, 8)` — the short random-looking string the user sees. This map feeds every "caregiver" column on the Records tab (EVV timesheets, general shifts, and the exports below).

## Fix

Replace the nested embed with the same two-step pattern already used further down in the same file (lines 429–432), which queries the `org_member_directory` view for staff names.

Rewrite `staffOptionsQ` to:

1. Fetch active members: `supabase.from("organization_members").select("user_id").eq("organization_id", orgId).eq("active", true)`.
2. Fetch names in one follow-up call: `supabase.from("org_member_directory").select("id, full_name").in("id", userIds)`.
3. Merge in JS: for each `user_id`, use `full_name` when present; fall back to the 8-char id slice only when truly missing (unchanged behavior for orphaned rows).
4. Return the same `{ value, label }[]` shape, sorted by label, so no downstream code changes.

No other logic, filters, exports, columns, or types change. Same query key (`["records-staff", orgId]`) so caching stays intact.

## Files touched

- `src/components/records/records-tab.tsx` — only the `staffOptionsQ` block (≈20 lines).

## Verification

- Records tab caregiver column shows real names for active staff.
- Staff filter dropdown lists real names.
- Exports (CSV rows built from `staffMap`) include real names.
- No TS errors; build passes.