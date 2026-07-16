
## Root cause

The blank screen is a runtime crash from a server function, not the behaviors question itself. Clicking "No" triggers a re-render that (re)fetches client care data, which throws:

```
column clients.status does not exist
```

In `src/lib/client-care-data.functions.ts` line 182, the `clients` select still asks for a `status` column that doesn't exist on the live table. Same shape as the earlier `clients.preferred_name` bug we already fixed in this file.

## Fix

One file, two tiny edits — mirrors the previous `preferred_name` fix, no behavior changes:

**`src/lib/client-care-data.functions.ts`**

1. Line 182 — drop `status` from the `clients` select list so PostgREST stops asking for a non-existent column.
2. Line 241 — set `status: null` in the `CareIdentity` object (keep the field on the type so no downstream consumer breaks), instead of `row.status ?? null`.

That's it. `CareIdentity.status` stays typed as `string | null`; callers that read it just always see `null` until/unless a real column is added later.

## Out of scope

- Not touching the behaviors question UI.
- Not adding a `status` column to `clients` — that's a schema decision for later, not needed to unblock this crash.
- Not changing any other select in this file.
