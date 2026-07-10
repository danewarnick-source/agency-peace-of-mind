## Goal
Let admins add custom fields to a client, pinned to one of the six visibility sections (Identity, Care plan, Billing, Files, Operations, Compliance). Staff visibility is 100% inherited from the section toggle — no per-field switch, no new sections.

## Data model

Extend the existing `custom_field_definitions` table (already keyed by `organization_id`, `entity_kind`, `field_key`, `field_label`, `data_type`):

- Add `section text not null default 'identity'` with a CHECK constraint restricting it to the six section names from `client-staff-visibility.ts`.
- Backfill existing rows to `'identity'`.

`custom_field_values` is unchanged — values are stored per client via `entity_kind='client'` + `entity_id=clientId`, typed columns already exist.

No new `client_staff_visibility` field key is written for custom fields. Visibility is derived from the section alone.

## Server layer

New `src/lib/custom-fields.functions.ts`:
- `listClientCustomFields({ clientId })` — joins definitions (for this client's org, `entity_kind='client'`) with the client's values. Returns `{ id, section, field_key, field_label, data_type, value }[]`.
- `upsertClientCustomFieldValue({ clientId, definitionId, value })` — writes to the right typed column based on `data_type`.
- `createCustomFieldDefinition({ section, field_label, data_type })` — admin/manager only; derives `field_key` from label; enforces section is one of the six.
- `deleteCustomFieldDefinition({ id })` — admin/manager only.

Extend `getClientCareData` in `src/lib/client-care-data.functions.ts`:
- Load custom field definitions + values alongside the existing four reads.
- Add `custom_fields: CustomFieldWithValue[]` to `ClientCareData` (full list, admin view).
- In `visibility.staffCare`, add `custom_fields` filtered by `sections[def.section]` only — no per-field key check. When the owning section is off, drop the field entirely.

No changes to `client_staff_visibility` or `setClientStaffVisibility` — custom fields deliberately bypass per-field toggles.

## Admin UI

New `src/components/clients/custom-fields-panel.tsx`:
- Small `<CustomFieldsForSection section={...} clientId={...} />` component rendered at the bottom of each of the six `TabsContent` blocks in `src/routes/dashboard.clients.$clientId.tsx`.
- Lists that section's custom fields with an inline value editor per row (text / number / date / boolean based on `data_type`); saves via `upsertClientCustomFieldValue` and invalidates `['client-care-data', clientId]`.
- "Add custom field" button opens a dialog: label + data type; `section` is pre-filled from the tab and locked (no dropdown to change section, no way to create a new section).
- Row overflow menu → delete definition (admin/manager only).
- No visibility switch anywhere on the row. Small helper text: "Visible to staff whenever the {section} section is on."

## Staff surface

`src/components/workspace/about-tab.tsx` (and any other staff-facing surface reading `visibility.staffCare`) renders the filtered `custom_fields` list under the matching section heading — Identity fields with identity, Care plan fields with the care panel, etc. Because filtering already happens in `getClientCareData`, staff code just maps over what it receives.

## Acceptance
- Add a custom field in Identity → shows up on staff About view (Identity is on by default).
- Add a custom field in Billing → not visible to staff; flip the Billing section toggle on → it appears.
- Edit a custom field's value on the admin profile → staff view reflects the new value after refetch (both surfaces share the same `['client-care-data', clientId]` query key).
- No way in the UI to create a new section or to toggle a single custom field independently of its section.

## Out of scope
- Per-field visibility overrides for custom fields (explicitly rejected by the spec).
- Reordering custom fields, grouping, or nesting.
- Custom field types beyond text/number/date/boolean.
- Custom fields on Activity (Activity is not one of the six sections).

## Files touched
- Migration: add `section` column + CHECK to `custom_field_definitions`.
- New: `src/lib/custom-fields.ts` (shared types/section list), `src/lib/custom-fields.functions.ts`, `src/components/clients/custom-fields-panel.tsx`.
- Edited: `src/lib/client-care-data.functions.ts` (load + filter custom fields into `staffCare`), `src/routes/dashboard.clients.$clientId.tsx` (mount panel in each of six tabs), `src/components/workspace/about-tab.tsx` (render staff custom fields under matching section).
