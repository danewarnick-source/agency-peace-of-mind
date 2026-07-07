## Root cause

`src/lib/smart-import-nectar-mapping.functions.ts` loads the staff roster with a PostgREST embedded select:

```ts
supabase
  .from("organization_members")
  .select("user_id, profiles:profiles!inner(id, first_name, last_name, full_name)")
  ...
```

Supabase returns:
> Could not find a relationship between 'organization_members' and 'profiles' in the schema cache

which is the exact landmine documented in the project brain: `organization_members` and `profiles` have no FK — both key off `auth.users.id`, so they can never be PostgREST-embedded. The server function throws, the wizard toasts "NECTAR couldn't suggest a mapping…", and the Map step falls back to "Automatic mapping unavailable."

This affects the Historical timesheets wizard and the Historical daily notes wizard (they share this function). It's not related to the Client Smart Import tab — the URL just happened to say `mode=client`; the wizard shown in the screenshot is the timesheets one.

## Fix

In `src/lib/smart-import-nectar-mapping.functions.ts`, replace the embedded roster query with two queries joined in JS:

1. `organization_members.select("user_id").eq("organization_id", …).eq("active", true).limit(800)` → get member `user_id`s.
2. `profiles.select("id, first_name, last_name, full_name").in("id", memberUserIds)` → get their profile rows.
3. Build the `staff: Person[]` array by mapping the profiles result (same shape as today).

Everything downstream (`columnHints`, NECTAR prompt, overlap override, final mapping) stays identical — only the roster fetch changes.

Clients query is untouched; it already reads directly from `clients` with no embed.

## Verification

- Reload the Historical timesheets wizard, upload the same `timeclock-timesheet_overview…xlsx`, and confirm:
  - No red toast, no error boundary.
  - Map step shows "NECTAR suggested a mapping for N of M fields" (or a partial mapping) instead of "Automatic mapping unavailable."
- Repeat for the Historical daily notes wizard with any CSV/XLSX to confirm the shared function works there too.
- No DB migration and no other files change.
