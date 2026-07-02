## Goal
Make every section of the Smart Import review page (visible in the screenshot and its siblings) read cleanly on a MacBook without horizontal scroll or vertical crowding. Nothing changes about logic, extraction, saves, or approval flow — this is a UI density + responsive pass.

## Scope (files touched)
- `src/routes/dashboard.smart-import.$jobId.review.tsx` (main pass)
  - `BillingCodesEditor` + `BillingRowEditor` (the card shown in the screenshot)
  - `SubjectWizard` header + `StepRail`
  - Section wrappers (`PlacementLineup`, `MedicationsReviewPanel`, `GoalsReviewPanel`, `ValidationPanel`, `AssignmentMapPanel`) — outer padding/typography only
- No changes to server functions, data model, or behavior.

## Concrete changes

### 1. Billing codes card (the visible problem)
- Collapse the intro paragraph into a **single one-liner** ("Ownership shows who bills each code. Only 'Ours' flows to your 520s.") with a small `?` popover that keeps the full explanation. Removes ~3 lines of chrome.
- Header row: shrink title to `text-sm`, move "Add code" into a compact icon+label button aligned right; wrap with `grid-cols-[minmax(0,1fr)_auto]` per responsive rule.
- Table:
  - Drop `table-fixed` px widths; switch to fluid `min-w` + `whitespace-nowrap` on numeric cells, `truncate` on Provider.
  - Inputs shrink from default `h-9` to `h-7 text-xs` (Unit/Rate/Annual/Mo.cap/Term). Date field becomes an 8-char native input, no giant calendar chrome — icon-only trigger.
  - Combine "Ownership / Approval" into a single stacked cell with a compact pill + subtle secondary line (no big second badge).
  - Term column: render `MM/YY – MM/YY` in one field; open full editor on click.
  - Actions column: single `⋯` menu (Remove, Undo) instead of two icon buttons.
- Wrap the whole table in `overflow-x-auto` (already there) but at `lg+` no scroll is needed after column tightening.
- The amber "external codes" summary block collapses to one line with a "Details" disclosure for the mono list.

### 2. Wizard step rail (top)
- Rail becomes a single horizontal scroll strip on `<lg` (chips), and a compact numbered inline row on `lg+` (`text-xs`, tighter gap, smaller check icons).
- Header ("Dashboard / TNS FAKE · Company Admin" area is outside scope; leave alone).

### 3. Shared card shell
- Introduce local helper classes in this file: `SECTION = "rounded-2xl border border-border bg-card p-3 md:p-4 shadow-[var(--shadow-card)]"` and `SECTION_TITLE = "text-sm font-semibold"`. Apply to all review panels for uniform, tighter padding (currently `p-4`/`p-6` mix).
- Standardize helper text to `text-[11px] text-muted-foreground leading-snug`, max 2 lines with a "More" toggle where currently 3–5 lines.

### 4. Responsive rules applied everywhere
- Every header row containing text + widgets uses `grid-cols-[minmax(0,1fr)_auto] sm:flex sm:flex-wrap sm:justify-between` with `min-w-0` / `truncate` / `shrink-0` per project responsive-layout rule.
- No `flex-row` defaults on mobile; stack then promote at `md:`.

## Non-goals
- No new features, no data-shape changes, no approval-flow changes.
- Not touching the sidebar/topbar (`Ask NECTAR` bar, Guide me).
- Not restyling the ApprovalDialog contents.

## Verification
- `npm run build` green.
- Playwright: load `/dashboard/smart-import/<job>/review` at 1280×800 and 1024×768; screenshot the Billing card and confirm no horizontal scroll and the whole card fits with room to spare.
