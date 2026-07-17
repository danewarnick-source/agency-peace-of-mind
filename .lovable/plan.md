# Fix: Historical Daily Notes CSV/Excel upload stuck on "loading staff and clients"

## Root cause
`DailyNotesImportWizard` loads the staff pool with a nested PostgREST embed:

```ts
supabase
  .from("organization_members")
  .select("user_id, profiles:profiles!inner(id, first_name, last_name, full_name)")
  .eq("organization_id", ...)
  .eq("active", true)
```

There is no foreign key between `organization_members` and `profiles` in this project (both tables key off `auth.users.id`). The embed silently errors, `peopleQ` never resolves with data, and every upload attempt hits the guard:

```ts
if (!peopleQ.data) {
  toast.error("Still loading staff and clients — try again in a moment.");
  return;
}
```

So the file is never parsed and nothing uploads — exactly the symptom reported.

## Fix
In `src/components/smart-import/daily-notes/daily-notes-import-wizard.tsx`, replace the embedded query with the same two-step pattern already used elsewhere in the app for this situation:

1. Query `organization_members` for `user_id` where `organization_id = org` and `active = true`.
2. Query `profiles` with `.in("id", userIds)` for `id, first_name, last_name, full_name`.
3. Join in JS to build the `staff: Person[]` array (same shape / `personNorms` output as today).
4. Keep the clients query unchanged.
5. Surface real errors from either query via `throw` so the existing `peopleQ.isError` toast has a useful message.

No other files change. No DB / RLS / template / server-fn changes. Parsing, matching, review UI, duplicate check, and commit flow are untouched — once the people pool actually loads, the existing CSV/XLSX parser (which already handles both formats correctly) runs normally.
