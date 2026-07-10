# Plan — one shared reader for client care data

## Why

Today every care surface (PCSP tab, eMAR chart, shift screen, workspace, punch-pad, whiteboard scoring, setup checklist, etc.) queries `clients`, `client_medications`, `client_specific_trainings`, and `client_billing_codes` independently. That's what let the PCSP admission-date bug and the eMAR-vs-attestation table mismatch happen. We need one canonical read path with the visibility rules baked in.

## Scope of "care data"

For this pass, the shared function returns exactly what the current bug-prone surfaces need:

- **identity**: normalized profile fields (name, dob, admission_date as a raw `YYYY-MM-DD` string — no timezone conversion, matching the Profile-tab fix), plus the tenure/care flags used by cards (self_admin_med_support + locked, behavior toggles, etc.).
- **pcsp_goals**: structured `CSTGoal[]` from `client_specific_trainings` (person_specific), each `{ id, goal, supports, details, job_codes[], is_complete }`. `is_complete` = has goal text AND at least one job_code. Legacy `clients.pcsp_goals` is NOT read from — the CST row is canonical (we already backfilled).
- **medications**: rows from `client_medications` in the shape the eMAR chart / MAR calendar / attestation flow expects — one source of truth, so nothing can drift to a different table again.
- **authorized_codes**: currently-open `client_billing_codes` (same "no end date or end date in the future" filter `useClientBillingCodes` uses).

Out of scope for now (kept in their existing hooks; can migrate later): scheduling, financial rollups, EVV timesheets, whiteboard SCORING math, incident/behavior histories.

## The function

`src/lib/client-care-data.functions.ts`

```ts
export const getClientCareData = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientId: string; shiftServiceCode?: string | null }) => i)
  .handler(async ({ data, context }) => { ... })
```

Returns:

```ts
type ClientCareData = {
  identity: { id, first_name, last_name, admission_date: string|null, dob: string|null, ... };
  flags: { self_admin_med_support, self_admin_med_support_locked, ... };
  goals: CSTGoal[];                         // all structured goals
  medications: ClientMedication[];          // raw rows, canonical shape
  authorized_codes: ClientBillingCode[];    // currently-open only
  visibility: {
    goalsForStaff: CSTGoal[];               // filtered: is_complete AND job_codes ∋ shiftServiceCode
    medicationsVisible: boolean;            // section toggle
    // room for future per-section toggles
  };
};
```

The `visibility` block is the **only** place staff-visibility rules live: which sections are toggled on, which goals are complete enough to show, and which goals match the active service code. When `shiftServiceCode` is omitted, `goalsForStaff` returns admin-view (all complete goals). Callers never re-implement these filters.

## Client-side hook

`src/hooks/use-client-care-data.tsx` — thin `useQuery` wrapper with a stable key `['client-care-data', clientId, shiftServiceCode ?? null]` and shared `queryOptions` so loaders can `ensureQueryData`.

## Migration — screens that switch to it in this change

Only the surfaces the user called out plus their direct siblings, so we prove the pattern end-to-end without touching every consumer at once:

1. `src/components/clients/pcsp-tab.tsx` — replace its own goals/identity queries.
2. `src/components/workspace/emar-chart.tsx` — read `medications` + `flags` (self-admin) from the hook; the toggle mutation stays where it is.
3. `src/components/workspace/mar-emar-tab.tsx` and `src/components/medications-manager.tsx` + `src/components/mar-calendar.tsx` — same.
4. `src/components/evv/punch-pad.tsx` — read `visibility.goalsForStaff` (passing the shift's `service_type_code`) instead of its own filter.
5. `src/routes/dashboard.workspace.$clientId.tsx` and `src/routes/dashboard.shift.$shiftId.tsx` — prime the cache via loader, drop ad-hoc client fetches.
6. `src/components/staff-mobile/client-quick-info-sheet.tsx` — read from the hook.

Everything else keeps working unchanged (existing hooks like `useClientBillingCodes` stay, but internally we point them at the shared function in a later pass — not this PR).

## Guardrail so no new screen bypasses it

- ESLint rule `no-restricted-syntax` in `eslint.config.js` that flags direct `.from('clients')`, `.from('client_medications')`, `.from('client_specific_trainings')`, `.from('client_billing_codes')` reads outside an allowlist:
  - `src/lib/client-care-data.functions.ts`
  - existing hooks named in the allowlist (billing hooks, etc.) until they're migrated
  - migrations / types / server-only import & billing pipelines
- Rule message: "Read client care data via `getClientCareData` / `useClientCareData`."

New screens can't add fresh queries without either adding themselves to the allowlist (visible in review) or going through the shared function.

## Files touched

- new: `src/lib/client-care-data.functions.ts`, `src/hooks/use-client-care-data.tsx`
- edited: the six migration targets above, `eslint.config.js`
- no schema changes, no migrations

## Not doing in this PR

- Rewriting the ~40 other files that touch `clients`/`client_medications`/goals. They're on the allowlist and get migrated in follow-ups, one care-surface at a time. Doing them all at once is where this kind of refactor usually breaks the app.
- Changing what data is stored, or any RLS/GRANT changes.
- Consolidating scheduling / financial / EVV reads — different domain, separate refactor.
