## Goal

Add two-level staff-visibility control per client: **section toggle** as a hard override, and **per-field toggle** within each on-section. All enforcement lives in the shared `getClientCareData` visibility block from Prompt 1 — no screen re-implements the rules.

## Sections and defaults

Six sections match the consolidated tabs (Activity is out of scope — it's a staff-generated record, not admin-editable data staff would read):

| Section    | Default for staff |
| ---------- | ----------------- |
| Identity   | **on**            |
| Care plan  | **on**            |
| Operations | **on**            |
| Billing    | off               |
| Files      | off               |
| Compliance | off               |

Rule: **section off ⇒ nothing in it reaches staff**, and per-field toggles are ignored while the section is off (hard override, matching the request).

## Data model

Two new tables, both `client_id`-scoped and org-scoped via RLS. Section rows are sparse (row exists only when admin overrides the default); field rows are sparse (row exists only when admin hid the field). Absence = default.

**`client_section_visibility`**
- `client_id uuid` (FK clients)
- `section text` — one of `identity | care_plan | billing | files | operations | compliance`
- `visible_to_staff boolean not null`
- unique (`client_id`, `section`)

**`client_field_visibility`**
- `client_id uuid` (FK clients)
- `section text` — same enum as above
- `field_key text` — stable identifier: goal id (uuid), medication id, custom-field-definition id, or a fixed identity-field name (`medicaid_id`, `emergency_contact`, `guardian`, `support_coordinator`, `admission_date`, `dob`, `preferred_name`)
- `hidden_from_staff boolean not null default true` (rows only exist to hide)
- unique (`client_id`, `section`, `field_key`)

Both tables: standard grants (authenticated CRUD, service_role all), RLS via `is_org_admin_or_manager` for writes and `is_org_member` for reads (staff need to read to know what to render). `updated_at` trigger. No anon grant.

## Shared function changes

Extend `ClientCareVisibility` in `src/lib/client-care-data.functions.ts`:

```ts
export type StaffSection = "identity" | "care_plan" | "billing" | "files" | "operations" | "compliance";

sectionsForStaff: Record<StaffSection, boolean>;    // resolved: defaults ∘ overrides
hiddenFieldKeys: Record<StaffSection, Set<string>>; // only fields explicitly hidden
```

`getClientCareData` handler:
1. Load both visibility tables in the existing `Promise.all`.
2. Apply defaults, overlay section overrides → `sectionsForStaff`.
3. Build `hiddenFieldKeys` per section from field rows.
4. Rewrite existing derived visibility:
   - `goalsForStaff` = current rule **AND** `sectionsForStaff.care_plan` **AND** goal id ∉ `hiddenFieldKeys.care_plan`.
   - `medicationsVisible` becomes `medicationsForStaff: CareMedication[]` filtered by section + per-med id.
   - Add `identityForStaff`: partial identity object with hidden fields nulled out (or `null` when section off).
5. Everything staff-facing (`punch-pad`, workspace, eMAR) already reads `visibility.*`, so it automatically inherits the new rules with no per-screen change beyond swapping `medicationsVisible: boolean` → `medicationsForStaff: CareMedication[]`.

Cache key: add nothing — visibility rows live under the same `clientId` query key and invalidate together.

## Admin UI

In the consolidated client profile (`dashboard.clients.$clientId.tsx`):

- **Section toggle**: a `Switch` in each tab's header (Identity / Care plan / Billing / Files / Operations / Compliance) labeled *"Visible to staff"*, seeded from `sectionsForStaff[section]`. Writes a row to `client_section_visibility` (upsert).
- **Per-field toggle**: an eye/eye-off icon button next to each row where per-field control makes sense:
  - Identity: fixed fields (medicaid_id, dob, emergency contacts, guardian, support coordinator, admission date, preferred name).
  - Care plan → Goals: each `CareGoal` row (keyed by goal id).
  - Care plan → Medications: each `CareMedication` row (keyed by med id).
  - Operations: each custom-field row (keyed by `custom_field_definitions.id`).
  - Billing/Files/Compliance: no per-field UI needed (default-off sections; admin flips the section toggle when they want staff to see them, then everything inside is visible unless a specific row is hidden — same eye-off pattern on any listed row).

When a section is off, the per-field controls in that tab render disabled with tooltip *"Section is hidden from staff — turn on to control individual fields."*

Two server functions in a new `src/lib/client-visibility.functions.ts`:
- `setSectionVisibility({ clientId, section, visibleToStaff })`
- `setFieldVisibility({ clientId, section, fieldKey, hidden })` (deletes the row when `hidden === false`, upserts when true)

Both `.middleware([requireSupabaseAuth])`, both verify admin/manager via `has_role`.

## Files touched

- Migration: `client_section_visibility` + `client_field_visibility` (+ grants, RLS, trigger).
- Edit: `src/lib/client-care-data.functions.ts` — extend visibility block.
- New: `src/lib/client-visibility.functions.ts` — two mutation server fns.
- New: `src/components/clients/visibility-controls.tsx` — `<SectionVisibilitySwitch />` and `<FieldVisibilityToggle />`.
- Edit: `src/routes/dashboard.clients.$clientId.tsx` — mount `SectionVisibilitySwitch` in each of the six tab headers.
- Edit: goal-editor row (`ClientSpecificTrainingCard` / `PlanGoalsPanel`), medication row (`MarEmarTab` list), custom-field row, and the Identity fixed-field list — each gets a `<FieldVisibilityToggle />` in admin view (hidden in staff view).
- Edit: staff-facing consumers of `visibility.medicationsVisible` → `visibility.medicationsForStaff.length > 0` (small mechanical change, ~3 call sites).

## Out of scope

- No changes to the section list itself — Activity stays as-is (staff record, not admin-editable data).
- No bulk "hide all similar" tool.
- No audit trail on toggles beyond `updated_at` (can add later if requested).
