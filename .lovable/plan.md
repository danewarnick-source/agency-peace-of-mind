## Goal

Add two-level staff visibility for a client's information:

1. **Section toggle (hard override)** — one on/off per section: Identity, Care plan, Billing, Files, Operations, Compliance. Off = nothing in that section reaches staff, no exceptions.
2. **Per-field toggle** — inside a section that is on, every individual field (each PCSP goal, each medication, each authorized code, each custom field, plus each fixed identity field) has its own on/off, defaulting on. Admins can hide one specific field without touching the rest.

Defaults for the section toggles: **Identity, Care plan, Operations = on**; **Billing, Files, Compliance = off**.

All staff-facing surfaces (workspace About tab, punch pad, eMAR, shift screen, anything else that reads client care data) inherit both filters automatically through the existing `getClientCareData` / `useClientCareData` path — no surface re-implements the rules.

## Data model

One new table storing both levels of visibility as a single JSON blob per client (avoids a row-per-field table that would need a schema entry for every future field):

```text
client_staff_visibility
  client_id            uuid PK, FK -> clients.id
  organization_id      uuid NOT NULL
  sections             jsonb NOT NULL default '{}'::jsonb
       -- { identity: bool, care_plan: bool, billing: bool,
       --   files: bool, operations: bool, compliance: bool }
       -- Missing key => fall back to hard-coded default
       -- (identity/care_plan/operations = true, others = false).
  fields               jsonb NOT NULL default '{}'::jsonb
       -- { "identity.admission_date": false,
       --   "identity.medicaid_id": true,
       --   "care_plan.goal:<goal-uuid>": false,
       --   "care_plan.medication:<med-uuid>": false,
       --   "billing.code:<row-uuid>": false,
       --   "identity.custom:<custom_field_def_id>": false, ... }
       -- Missing key => visible (default on).
  updated_at, updated_by
```

RLS: org members read; only `manage_clients` permission writes. GRANT `SELECT, INSERT, UPDATE` to `authenticated`; `ALL` to `service_role`.

Key format — `"<section>.<kind>:<id>"` where `<kind>` is `field` (fixed identity fields use `identity.field:admission_date`), `goal`, `medication`, `code`, or `custom`. This is stable, cheap to look up, and doesn't require a migration when we add a new goal or med.

## Server: filtering lives in `getClientCareData`

`src/lib/client-care-data.functions.ts` already returns `visibility.goalsForStaff` and is the only path staff surfaces are allowed to read from. Extend it:

1. Load the client's `client_staff_visibility` row alongside the existing four parallel queries.
2. Resolve section state: `sectionOn(name) = row?.sections?.[name] ?? DEFAULTS[name]`.
3. Resolve field state: `fieldOn(key) = row?.fields?.[key] !== false` (default on).
4. Add to the returned `visibility` block:
   - `sections`: the resolved six booleans.
   - `staffCare`: the object staff surfaces should render — a filtered projection of `identity`, `goals`, `medications`, `authorized_codes`, plus custom fields, with:
     - When the owning section is **off**, the field/list is empty/nulled out.
     - When the owning section is **on**, hidden individual fields are removed (goals/meds/codes filtered out; identity scalar fields set to `null`).
     - The existing `goalsForStaff` continues to work, and now also respects per-goal visibility + the care-plan section toggle (in addition to the shift service-code filter it already applies).
5. Admin surfaces keep reading the raw `identity`, `goals`, `medications`, `authorized_codes` — those are unchanged. Staff surfaces switch to reading `visibility.staffCare` / `visibility.goalsForStaff`.

No schema change to the return type callers already depend on; this is purely additive.

## Server: write path

New server function `setClientStaffVisibility` (`.middleware([requireSupabaseAuth])`, permission-checked) that upserts sections/fields patches. Called from the admin UI toggles. Invalidates the `client-care-data` query key.

## Admin UI: visibility controls

A shared `<VisibilityToggle>` (section-level) and `<FieldVisibilityToggle>` (per-field eye icon) component. Wire them into each of the six tabs in `src/routes/dashboard.clients.$clientId.tsx`:

- **Section toggle**: rendered once at the top of each `TabsContent` for Identity, Care plan, Billing, Files, Operations, Compliance. Shows current state + default. When off, the whole section body dims with a "Hidden from staff" banner (admin still sees content — the toggle only affects staff surfaces).
- **Per-field toggle**: eye/eye-off icon next to
  - each fixed identity field row in `ClientProfileTab` / face sheet (name/DOB stay always-on and non-toggleable; toggleable set = admission_date, medicaid_id, guardian, emergency contacts, support coordinator, and every custom field);
  - each goal row in `PlanGoalsPanel`;
  - each medication row in `MarEmarTab`'s medication list;
  - each authorized code row in `BillingCodesPanel`;
  - each custom field row anywhere it renders.
- When the enclosing section is off, per-field toggles disable and show a tooltip "Section is hidden from staff — turn the section on to control fields individually."

## Staff surfaces updated to read the filtered projection

- `src/components/workspace/about-tab.tsx` — replace direct `client.pcsp_goals` and identity reads with `useClientCareData(clientId).data.visibility.staffCare`.
- `src/components/workspace/mar-emar-tab.tsx` and eMAR chart — medications list from `visibility.staffCare.medications`.
- `src/components/evv/punch-pad.tsx` — already uses `useClientCareData`; switch its identity/goal reads to `visibility.staffCare` / `visibility.goalsForStaff`.
- Any shift-screen surface pulling client info gets the same swap.

Because the enforcement is in the server function, a staff surface that forgets to swap still cannot see admin-only raw data as long as it goes through the shared hook; the existing eslint rule that forbids re-querying `clients` / `client_medications` / `client_specific_trainings` / `client_billing_codes` from outside `client-care-data.functions.ts` stays in force.

## Migration + defaults for existing clients

- Migration creates the table with the schema above; no backfill needed (missing rows resolve to defaults).
- The DEFAULTS constant lives in `client-care-data.functions.ts` so server and any client-side default preview stay in sync.

## Out of scope (explicitly)

- No change to who can *edit* client data — this is a staff-**view** filter only.
- Activity tab is unchanged (it's neither in the six sections nor staff-facing in this sense).
- No per-role visibility (admin vs. lead vs. DSP) — everything staff-facing gets the same filtered view; role-based nuance can layer on later without changing this schema.
- No audit history of toggle changes in this pass (updated_at/updated_by only).

## Files touched

- **New migration**: `client_staff_visibility` table + RLS + grants (handoff SQL).
- **Edited**: `src/lib/client-care-data.functions.ts` (load row, compute `sections` + `staffCare`, extend visibility block), new `set-client-staff-visibility.functions.ts`.
- **Edited**: `src/routes/dashboard.clients.$clientId.tsx` (mount section toggle at each tab head).
- **Edited** admin panels to render per-field toggles: `ClientProfileTab`, `FaceSheetInfoCard`, `PlanGoalsPanel`, `ClientSpecificTrainingCard`, `MarEmarTab` (med list section), `BillingCodesPanel`, custom-field renderer.
- **Edited** staff surfaces to read `visibility.staffCare` / `visibility.goalsForStaff`: `workspace/about-tab.tsx`, `workspace/mar-emar-tab.tsx`, `workspace/emar-chart.tsx`, `evv/punch-pad.tsx`, shift screen.
- **New**: `src/components/clients/visibility-toggles.tsx` (shared section + field toggle components + query invalidation).
