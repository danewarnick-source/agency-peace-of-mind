## Goal
Allow an employee to hold multiple Agency Positions (Direct Care, Host Staff, Office Staff, Admin), chosen via checkboxes in the Edit employee dialog. Reflect the multi-value field on the staff profile.

## Scope (intentionally small)
Only the Agency Position field changes. Edit dialog, mutation write, and the two read sites that render it. No other employee fields, no roles/permissions changes.

## Reuse (no new logic)
- `POSITIONS` list and `Position` type in `src/routes/dashboard.employees.index.tsx` — unchanged values.
- shadcn `Checkbox` + `Label` already used elsewhere in the file — same visual pattern.
- Existing `editMemberMutation` (writes via `supabase.from("profiles").update(...)`).
- Existing `Badge` rendering in `src/routes/dashboard.employees.$staffId.tsx`.

## Storage
Add `profiles.positions text[]` (default `'{}'`). Back-fill from the existing scalar `profiles.position` (single value → 1-element array). Keep the legacy `position` column for now and mirror writes (first selected value) so nothing downstream breaks; reads prefer `positions[]` and fall back to `[position]`. One migration via the Supabase migration tool.

## Edit dialog (`dashboard.employees.index.tsx`)
Replace the single `<Select name="position">` with a checkbox group built from `POSITIONS`. Local state `editPositions: Position[]` seeded from `editingMember.positions ?? (editingMember.position ? [editingMember.position] : [])`. Submit handler passes `positions` to the mutation. `editMemberMutation` writes `{ positions: editPositions, position: editPositions[0] ?? null }` to `profiles`. `EditableMember` type gains `positions: Position[]`; member list builder (line ~358) populates it.

## Read sites
- `dashboard.employees.$staffId.tsx` line 142 — render one `<Badge>` per position (fallback to legacy `position`).
- Same file line 171 — "Position" row shows comma-joined list, dash if empty.

## Out of scope
Roles/permissions, scheduling rules, RLS, billing, anything keyed off position elsewhere (none found in current search). No changes to the create-employee form unless you ask for it.

## Acceptance
- Edit dialog shows 4 checkboxes; current value(s) pre-checked; can select 0–4.
- Save persists to `profiles.positions`; staff profile shows all selected positions as badges and in the Position row.
- Existing single-position records still display correctly before any new edit.