
## Problem

When the Smart Import review shows a blocking warning like **"Last name is required"**, the only action is *"Confirm — I've reviewed this"*, which just dismisses the warning. There is nowhere in the UI to actually **type in** the missing value. Providers also find the heading **"Placement lineup"** confusing — it's internal jargon for "the fields NECTAR pulled out of the document and where they'll land on the client."

## Goal

1. Every "missing required field" warning gets a real **"Add [field]"** action that opens an inline input and creates the field on the record (no more dead-end "Confirm" for missing data).
2. Rename **"Placement lineup"** and give it a one-line plain-English explanation so providers understand what they're looking at.
3. Add a small **"Add a field NECTAR missed"** button at the top of that section so any required field (not just ones the validator flagged) can be added manually.

All UI + a small backend extension. No new pages.

## Scope of change

### 1. Inline "Add missing field" from the validation panel
`src/routes/dashboard.smart-import.$jobId.review.tsx` — `ValidationPanel` / `getIssueHelp`

- Detect issues whose key matches `client.missing.<field>` (already the convention — see `getIssueHelp`, line 672).
- For those rows, replace the current *"Confirm — I've reviewed this"* button with a primary **"Add [field name]"** button that opens a small inline editor (Input + Save / Cancel) directly under the warning row.
- On Save: call the extended `saveManualReviewRow` server fn (see §4) with `targetField` = the missing field key and the typed value. On success: invalidate the subject query so both the validation panel and the field list update — the warning clears automatically once the field exists and validation re-runs.
- Keep the existing "Confirm — I've reviewed this" as a secondary/ghost button for cases where the admin legitimately wants to acknowledge without adding data (e.g. field truly doesn't apply).

### 2. Rename "Placement lineup" → provider-friendly
`src/routes/dashboard.smart-import.$jobId.review.tsx` — `PlacementLineup`, line 948

- Change the visible heading from **"Placement lineup"** to **"Information NECTAR pulled from the file"**.
- Change the subtext from *"SOW-required fields only. Edit or × to remove."* to *"These are the required fields for a client record. Edit any value, remove a row with ×, or add anything NECTAR missed."*
- No internal renames — the component name and prop names stay as-is to keep the diff tight.

### 3. "Add a field NECTAR missed" affordance
Same section, in the header row next to the subtext:

- Add a small `+ Add a field` button.
- Opens a lightweight popover with:
  - A **Select** of required target fields that aren't already present on this subject (computed from `targetFields` minus fields already in `core`), e.g. `last_name`, `date_of_birth`, `medicaid_id`, etc., with human labels.
  - A single **Input** for the value.
  - A **Save** button that calls the same extended `saveManualReviewRow`.
- On success: invalidate → the new field appears as a row in the list and any related "missing" warning clears.

### 4. Backend: broaden `saveManualReviewRow` to accept any client field
`src/lib/smart-import-review.functions.ts`, line 145 + its `ManualReviewRowInput` schema.

Currently the validator restricts `targetField` to `pcsp_goal` / `client_medication`. That's the only reason we need a backend touch — the insert path below it (lines 186–207) already writes to `extracted_fields` with `target_table: "clients"` in exactly the shape we need.

- Extend the schema to accept any string `targetField` (still non-empty, still trimmed, still trims + validates the value).
- Keep the existing `label` and `action` audit-log branch for the two special cases; for any other client field write a generic audit entry: `item: "Added <field> manually"`, `action: "edit_client_field"`.
- No new server function. RLS and audit trail already covered by the existing handler.

### 5. Auto-clear the validation issue when the field is filled
The validator already re-runs on subject change (existing `onChanged` invalidates the subject query and `getReviewSubject` recomputes validation). So once the new `extracted_fields` row exists with a non-empty value, `client.missing.<field>` disappears from `validation.issues` on its own. **No manual override call needed** — this is more honest than the current "Confirm — I've reviewed this" click, which only hides the warning without fixing it.

## Non-goals

- No change to how validation is computed server-side.
- No redesign of the wizard steps or the wider review page.
- No change to the billing-code table, PCSP goals editor, or medications table.
- Custom attributes section is untouched.

## Technical details

**Files touched**
- `src/routes/dashboard.smart-import.$jobId.review.tsx`
  - `ValidationPanel` (line 702) — inline add editor for `client.missing.*` rows.
  - `getIssueHelp` (line 656) — update copy for `client.missing.*` to reflect the new "Add" action.
  - `PlacementLineup` (line 926) — new heading/subtext + "+ Add a field" popover.
- `src/lib/smart-import-review.functions.ts`
  - `ManualReviewRowInput` schema (near top of file) — allow any non-empty `targetField` string, not just the two enum values.
  - `saveManualReviewRow` handler — generic audit-log fallback for non-goal / non-medication fields.

**Human labels for target fields**
Add a small `CLIENT_FIELD_LABELS` map (`first_name → "First name"`, `last_name → "Last name"`, `date_of_birth → "Date of birth"`, `medicaid_id → "Medicaid ID"`, etc.) co-located in the review route file, used by both the validation-panel button ("Add last name") and the popover's Select. Fall back to a title-cased version of the key for anything not in the map.

**No migration required** — `extracted_fields` already stores the shape we need and RLS/grants are already in place for authenticated org admins.
