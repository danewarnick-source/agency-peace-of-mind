
## Goal

Replace the header-guessing / NECTAR-column-mapping flow in the historical **daily notes** import with the same required-template flow already used by historical timesheets. If the uploaded file doesn't match the template exactly, tell the user to download the template — don't try to guess.

## Scope

Frontend only. No changes to server functions, DB schema, or the downstream matching / duplicate-check / staff-attestation flow.

## Files

### 1. New — `src/lib/historical-daily-notes-template.ts`

Mirrors `src/lib/historical-timesheets-template.ts`. Exports:

- `TEMPLATE_HEADERS`, in this exact order:
  1. `Staff Name`
  2. `Client Name`
  3. `Date`
  4. `Narrative`
  5. `Goals Addressed`  *(only column allowed to be blank)*
- One filled example row, e.g.
  - Staff Name: `Jane Doe`
  - Client Name: `John Smith`
  - Date: `2026-05-14`
  - Narrative: `Example row — delete before importing. John had a calm morning, ate breakfast independently…`
  - Goals Addressed: `Independent meal prep; Community outing`
- `buildTemplateCsv()`, `buildTemplateXlsxBlob()`, `triggerDownload()`, and `validateTemplateHeaders()` — same shape as the timesheets template module. Header check is case-insensitive/trimmed and exact-order; on mismatch, the error message tells the user to download the template and lists the five required columns.

### 2. Edit — `src/components/smart-import/daily-notes/daily-notes-import-wizard.tsx`

Remove all column-guessing; drive review rows off fixed template columns.

- **Remove** the import and any call to `suggestImportColumnMapping` from `@/lib/smart-import-nectar-mapping.functions`, and remove the `FieldSuggestion` / NECTAR-analyzing UI state.
- **Remove** the `Mapping`, `WholeFile`, and per-field manual mapping UI (Step 2 "Map columns" screen and its `MapStep`-style component).
- **Remove** the "whole file belongs to one staff/client" constants — no longer needed because the template requires Staff Name and Client Name on every row.
- Add imports from the new `historical-daily-notes-template` module (`TEMPLATE_HEADERS`, `buildTemplateCsv`, `buildTemplateXlsxBlob`, `triggerDownload`, `validateTemplateHeaders`).
- In `onPickFile`, after `parseFile`, call `validateTemplateHeaders(p.headers)`. If not ok, `toast.error(check.message)` and stop. Only on success do we continue.
- Build review rows directly from the fixed header names (`Staff Name`, `Client Name`, `Date`, `Narrative`, `Goals Addressed`) instead of the mapping lookup. Goals parsing keeps the existing `splitGoals` (newlines / semicolons).
- Collapse the wizard from **Upload → Map columns → Review → Commit** to **Upload → Review → Commit**. Update the stepper labels and step numbers accordingly, and jump straight from upload to review.
- Rework `UploadStep` to match the timesheets UploadStep: "Step 1 — download the template, then fill it in" card with a short description listing the five columns, a note that Goals Addressed is optional and the example row must be deleted before import, and two buttons: **Download template (CSV)** and **Download template (Excel)**. Keep the existing drag-drop / file-picker UI below.

### Kept exactly as-is

- Staff / client name matching against the org's real records.
- Ambiguous-match resolution UI.
- The admin "resolve this unmatched name everywhere it appears" action.
- Duplicate detection via `checkImportDuplicates`.
- Commit path through `createDailyNotesImportJob` / `importHistoricalDailyNotes` — imported rows still land in `pending_staff_attestation` awaiting staff sign-off.
- The former-staff attestation fallback page.

## Out of scope

- No changes to `src/lib/smart-import-daily-notes.functions.ts` or any other server function.
- No DB migration.
- No changes to `smart-import-nectar-mapping.functions.ts` (still used elsewhere; just no longer called from daily notes).
- No changes to the historical timesheets wizard.
