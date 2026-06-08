# Inline "+" inserter at the bottom of each section

Builder-only UX change. Adds a contextual "+" button at the bottom of every section group that opens the existing field-type palette and inserts the chosen field directly after that section's last field — preserving the flat `fields` array shape, drag-reorder grouping, and the existing "just added" flash/scroll/focus behavior.

## Files touched

- `src/routes/dashboard.forms.$formId.edit.tsx` — expose an `insertAfterIndex` insertion path; pass it (plus the type list) into `SortableFields`. Existing top palette stays unchanged.
- `src/components/forms/sortable-fields.tsx` — render an "Add field here" button at the bottom of each group; on click open a popover listing field types; on choose, call the insert callback with the group's last-flat-index.

No changes to: `forms-utils.ts`, save path, field types, conditional logic, `field-editor.tsx`, staff rendering.

## Insertion logic

- `addFieldAt(type, afterIndex)`:
  - `const f = defaultFieldFor(type)`
  - `setFields(arr => sanitizeConditions([...arr.slice(0, afterIndex + 1), f, ...arr.slice(afterIndex + 1)]))`
  - `setLastAddedId(f.id)` → triggers the existing flash + scrollIntoView + label-focus in `SortableItem`.
- The existing `addField(type)` (top palette) stays as append-to-end.
- For each rendered group, compute `lastIdx`:
  - If `g.fields.length > 0` → flat index of the last field in the group.
  - Else if `g.section` exists (empty section) → flat index of the section header itself (so the new field lands as that section's first child).
  - Head/ungrouped group (no section, before first section): also supported via the same calc; if it has fields, insert after its last field; if it has nothing it isn't rendered.
- Choosing "Section / instructions" from the inline menu works identically (it just inserts a `section` field at that location, which the existing `computeGroups` will treat as a new section break).

## UI

- Inline button: small dashed "+ Add field here" button at the bottom of each group's indented field column (inside the same colored group container, after the last `SortableItem`).
- Opens a shadcn `Popover` (or `DropdownMenu`) containing the same `TYPE_GROUPS` / `TYPE_LABEL` lists already imported in the edit route. To avoid duplicating the type-list constants in `sortable-fields.tsx`, the route passes a render-prop / typed list down:

```ts
<SortableFields
  fields={fields}
  setFields={setFields}
  lastAddedId={lastAddedId}
  onLastAddedConsumed={() => setLastAddedId(null)}
  typeGroups={TYPE_GROUPS}
  typeLabel={TYPE_LABEL}
  onInsertAt={(type, afterIndex) => addFieldAt(type, afterIndex)}
/>
```

- Popover content mirrors the top palette layout (grouped by category, same labels, same icons) so the chooser is visually consistent.

## Compatibility with existing builder features

- **Flash/scroll/focus:** reuses `lastAddedId` → `SortableItem`'s existing `justAdded` effect (no duplication).
- **Grouped drag-reorder:** the new field is inserted into the flat array between the section's last field and the next section marker, so `computeGroups` naturally groups it under the right section; drag handles work as-is.
- **Conditional logic:** insertion runs through `sanitizeConditions` like every other mutation.
- **Save path:** unchanged — still serializes the flat `fields` array.
- **Top palette:** untouched; still appends to end.

## Verify

1. Each section shows a "+ Add field here" at its bottom; click opens the type palette popover.
2. Pick "Short text" inside Section B → new field becomes Section B's last field (NOT the form's last field).
3. Pick "Section / instructions" from inside Section B → a new section break is inserted at that point; subsequent fields previously trailing B now belong to the new section (consistent with current section semantics).
4. The new field flashes, scrolls into view, and its label input is focused.
5. Drag the new field up/down — it reorders and remains grouped under its section.
6. Save → reload → order and field config persist; staff filler renders identically.
7. Top palette still appends to the end as before.

---

# DOCKET — Requirement frequency + "Tell NECTAR" note + last-checked
Status: PARKED. Build AFTER per-shift Stage 5 and current verification pile.

## Origin
Some compliance requirements recur (e.g. 1056 form lives on Provider UPI/USTEPS, updated ongoing). Today `nectar_requirements` is essentially done/not-done. Need cadence + provider-described tracking method + last-verified date so audits can prompt re-checks.

## Scope (light extension to nectar_requirements — NOT per-shift tracking forms)
Each requirement carries:
1. **Frequency** (provider-set dropdown): one-time, per employee, per shift, per code, per day, per week, per month, per quarter, per year, per billing-rate-unit, ongoing.
2. **"Tell NECTAR" free-text note** — captured at CONFIRM time. Provider's own words on how they track it (e.g. "1056s on Provider UPI/USTEPS; updated ongoing"). Clearly labeled "Tell NECTAR" field.
3. **Last-checked / last-verified date** — used with frequency to compute due/overdue on read.

## Surfaces
- **Confirm-time:** when provider confirms a requirement → set frequency + Tell NECTAR note + initial last-checked.
- **Audit-time:** Internal Audit / Agency Command Center surface AND external-audit context show a prompt listing requirements due/overdue per frequency + last-checked ("12 recurring requirements due for re-verification: 1056 (ongoing, last checked Mar), ...").

## NECTAR boundary (critical posture)
- PROVIDER declares frequency + tracking method. NECTAR stores, surfaces, reminds. NECTAR does NOT autonomously assert cadence.
- "Tell NECTAR" note is the provider's own description; NECTAR uses it to remind/contextualize — never to invent compliance rules.

## Fit / reuse
- `nectar_requirements.metadata` already has renewal / evidence_type concepts from intake checklist work. Promote frequency + last-checked + Tell NECTAR note into consistent first-class provider-editable attributes — likely metadata fields, NOT a new table (confirm in short diagnose).
- Keep separate from per-shift tracking forms (`form_submissions`) and from `bc_*`. Recurring 1056 = compliance requirement attribute, not a tracking form.
- Internal Audit QA tooling already exists (Agency Command Center / Internal Audit) — hook audit-time prompt INTO that surface, don't build parallel.

## Keep it light
Frequency dropdown + Tell NECTAR free-text + last-checked date + derived due/overdue computation surfaced at audit-time. NOT a scheduling/cron engine. Due/overdue derived on read.

## When building — diagnose first
Confirm where requirement-confirm/metadata lives, how intake renewal concept already works, and where Internal Audit surface is — extend, don't duplicate.
