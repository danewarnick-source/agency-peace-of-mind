## What's happening

Justin's incident report was NOT deleted. I confirmed it in the database:

- `67c53041-…` · Justin Hesse · 2026-07-07 · `Pending_Admin_Review` · org **TNS FAKE**

The reason "No incidents in this view" shows: your user (`d672c985-…`) is an active admin in **two** organizations — **TNS FAKE** and **HIPAA FREE PROVIDER LLC**. Every incident server fn (`listIncidents`, `incidentTrends`, and siblings) picks the org via `getMembership()` in `src/lib/incidents.functions.ts`:

```ts
.from("organization_members")
.eq("user_id", userId).eq("active", true)
.limit(1).maybeSingle()
```

There is no ordering and no awareness of the currently-active org, so Postgres returns whichever row it likes. When it returns HIPAA FREE, the query is filtered to `organization_id = <HIPAA FREE>` and Justin's TNS-FAKE incident is (correctly, from the query's point of view) filtered out. That's the entire bug.

The rest of the app already knows the "active org" — `useOrg().activeOrgId` — and org-scoped server fns elsewhere take an `organizationId` input and verify it with `requireOrgMembership`.

## Fix

Make the incidents server fns org-aware the same way the rest of the codebase is.

### `src/lib/incidents.functions.ts`

1. Add `organization_id: z.string().uuid()` to the input validators for:
   - `listIncidents`
   - `incidentTrends`
   - any sibling reader that currently calls `getMembership` for org scoping (createIncident, updateIncidentFollowupNotes, submitToUpi, getIncidentActors, etc. — only the ones that currently derive org from `getMembership`).
2. Replace the `getMembership(...)` call in each handler with:
   ```ts
   await requireOrgMembership(supabase, userId, data.organization_id /*, minRole*/);
   ```
   Preserve the existing minimum-role expectations (e.g. `requireManager` → `"manager"`).
3. Use `data.organization_id` in the `.eq("organization_id", ...)` filter instead of `m.organization_id`.
4. Leave `getMembership` in place only if some caller still needs it; otherwise remove.

### Client call sites

Every place that calls those server fns must pass the active org id from `useOrg()`:

- `src/components/incidents/admin-incidents-section.tsx` — `listIncidents` (and `getIncidentActors` if it becomes org-scoped)
- `src/components/incidents/incident-trends-strip.tsx` — `incidentTrends`
- `src/components/incidents/incident-report-dialog.tsx` (and any other consumer) — `createIncident`, `updateIncidentFollowupNotes`, `submitToUpi`

Pattern:
```ts
const { activeOrgId } = useOrg();
useQuery({
  queryKey: ["incidents", activeOrgId, view, status, ...],
  enabled: !!activeOrgId,
  queryFn: () => listFn({ data: { organization_id: activeOrgId!, ... } }),
});
```

Include `activeOrgId` in every query key so switching orgs refetches.

## Out of scope

- No schema/RLS changes. The row already exists and RLS already permits the caller — this is purely a wrong-filter bug on the read path.
- No changes to the UI/filters (status, client, category, date) — those are working as intended.
- Not touching non-incident server fns, even those that use similar `getMembership` shortcuts, unless you want a follow-up sweep.

## Validation

1. On the Documentation → Incidents tab with TNS FAKE active, Justin's `Pending_Admin_Review` incident appears in "Open queue".
2. Switching the active org to HIPAA FREE PROVIDER shows the two DEMO — Reese Carter / Quinn Walker incidents instead, and none from TNS FAKE.
3. Trends bar chart totals match the visible list for the active org.
