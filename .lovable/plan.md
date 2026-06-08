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
