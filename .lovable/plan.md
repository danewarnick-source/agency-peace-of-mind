## Goal
Tighten the EVV shift list in `src/routes/dashboard.compliance-desk.tsx` so each shift is a single compact row with the Shift Note, Goals Targeted, and full NECTAR flag detail collapsed by default. Click a row to expand only that shift. Presentation only — no changes to data, approve/edit, reconciliation, geofence, or NECTAR logic.

## Scope
Only `src/routes/dashboard.compliance-desk.tsx`. The four tables that share the row layout all already render a shift `TableRow` followed by `<InlineNotesRow row={r} colSpan={N} />`:
- `PendingTable` (Pending Review)
- `ReconcileTable` (EVV Reconciliation)
- `ArchiveTable` used twice (State EVV Archive, Internal / Non-EVV Archive)
- The Vector NECTAR cross-tab results block (lines ~770–824) — same row+InlineNotes pattern, so it gets the same treatment for consistency.

## Changes

1. **Shared expand state hook** (new local helper in the same file):
   - `useRowExpansion(rows)` returns `{ expanded: Set<string>, toggle(id), expandAll(), collapseAll(), isExpanded(id) }`.
   - Default: empty set (all collapsed).

2. **Expand all / Collapse all controls** at the top of each table (above the `<Table>`), right-aligned, small ghost buttons with chevron icons. Disabled when row list is empty.

3. **Collapsed row tightening**:
   - Add a leading chevron cell (`ChevronRight` rotated 90° when expanded) — make the whole `TableRow` clickable (`onClick={() => toggle(r.id)}`, `role="button"`, `aria-expanded`, `cursor-pointer`, `hover:bg-muted/40`).
   - Reduce vertical padding on the shift `TableRow` cells (swap default `py-*` for `py-1.5`) for a compact list feel. Keep existing columns/content otherwise unchanged.
   - **Flag indicator when collapsed**: if `r.ai_compliance_status === "Exception"`, render a small `AlertTriangle` (destructive color) next to the caregiver/client cell with `title="NECTAR flag"`. Hidden visual noise when expanded (the full banner appears in expanded section).

4. **Action click isolation**:
   - Wrap the approve (check) and edit (pencil) buttons' `onClick` handlers with `e.stopPropagation()` (also add `stopPropagation` on the cell wrapper) so clicking them does not toggle expansion.
   - Same for any "View" GPS link/button in the row.

5. **Conditional InlineNotesRow**:
   - Only render `<InlineNotesRow row={r} colSpan={N+1} />` when `isExpanded(r.id)`. The `+1` accounts for the new chevron column. Update each call site's `colSpan` (currently 9, 10, 11) accordingly.
   - `InlineNotesRow` itself is unchanged — it already contains the full NECTAR flag banner, shift note, and goals, which is exactly what "expand" should show.

6. **Header row**: add an empty `<TableHead className="w-8" />` cell at the start of each `TableHeader` row to match the new chevron column, and bump the empty-state `colSpan` values by 1.

## Out of scope (do not touch)
- `nectarReason()`, `InlineNotesRow` internals, `approve` mutation, `EditShiftDialog`, geofence matching, NECTAR scoring, queries, exports.
- No changes to other files.

## Verification
- All four tabs show single-line rows; clicking expands inline note/goals/flag detail; clicking again collapses.
- Flagged shifts show a red triangle on the collapsed row.
- Expand all / Collapse all toggle every row in that table.
- Clicking approve or edit does NOT toggle the row.
- Default load: every row collapsed.
