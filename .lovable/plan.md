# NECTAR mapping + review-at-scale upgrade

Two import wizards get the same treatment: historical timesheets and historical daily notes. Everything below applies to both, kept in parallel so they never drift.

## 1. Smarter mapping (server: `smart-import-nectar-mapping.functions.ts`)

**Sample deeply, not shallowly.** Wizards currently send ~10 sample values per column from the top of the file. Change to a stratified sample of up to 60 non-empty values pulled evenly from the beginning, middle, and end of the column, plus a `fill_rate` (non-empty ÷ total rows scanned, up to 2,000 rows). A column with `fill_rate < 0.3` is downgraded to "low" confidence and NECTAR is told explicitly "this column is mostly empty — do not pick it if a fuller column also matches."

**Roster match is primary, not confirmatory.** Precompute `staff_name_match_fraction` and `client_name_match_fraction` for *every* column (already exists) and additionally compute `mixed_person_fraction` = rows where the cell matches either a staff OR a client name. Any column with combined match ≥ 0.5 is offered to NECTAR as a candidate for staff, client, or a "person column that switches per row" — deterministic override still wins when the fraction is unambiguous.

**Per-row person resolution.** Extend the response with a `per_row_person_column` flag. When a single column matches staff on some rows and clients on others (each ≥ 0.2, combined ≥ 0.7), the row-builder resolves each cell against the roster individually rather than forcing the whole column to one label.

**Multi-sheet workbooks.** New input shape: instead of one `columns[]`, accept `sheets: [{ name, columns[] }]`. NECTAR returns `mapping[field] = { sheet, column, join_key? }`. Fields can come from different sheets; joins default to `(staff, date)`. Server returns `join_key_candidates` (columns present on every sheet with high fill rate) so the wizard can confirm.

## 2. Client-side parsing (both wizards)

Switch the parser from single-sheet CSV to XLSX-aware (`xlsx` npm — already used elsewhere; verify). For workbooks:

- Enumerate sheets, drop hidden/empty ones.
- Build the deep+stratified sample per column per sheet.
- Send the whole bundle in one NECTAR call.
- After mapping, materialize proposed rows by pulling each field from the sheet NECTAR chose, joining on `(staff_id_resolved, date)`.

Single-sheet CSVs keep working — they're just a `sheets` array of length one.

## 3. Review-at-scale UI (new shared component)

New file: `src/components/smart-import/shared/review-grid.tsx`. Both wizards mount it in stage 2.

Top bar shows counts and click-to-filter chips:
- **Clean** — every field resolved, no warnings.
- **Ambiguous person** — staff or client resolved to >1 candidate.
- **Unmatched** — staff or client not in roster.
- **Incomplete** — missing date/time/narrative/etc.
- **Likely duplicate** — see §4.
- **All**.

Grid is virtualized (`@tanstack/react-virtual` — already in tree; if not, add). Every cell is editable in place: person cells become a combobox over the org roster; date/time cells validate on blur; narrative is a textarea popover. Edits are stored in a per-row overlay so the original NECTAR proposal is preserved for audit.

**Bulk fix.** Unresolved values (e.g., "J. Smith" appearing on 47 rows and matching no one) are grouped in a right-hand "Repeated issues" panel: pick the correct staff/client once and every row using that raw value is updated. Same for a mistyped date format that fails on N rows.

## 4. Duplicate detection

Before showing the grid, a new server function `checkImportDuplicates` takes the proposed rows and queries `evv_timesheets` (or the daily-notes table) for the org, batched by `client_id + date` range, and returns matches on `(staff_id, client_id, date, clock_in±5min, clock_out±5min)` for timesheets, or `(staff_id, client_id, date)` for daily notes. Matches render as a "Likely duplicate" badge; the row defaults to *skip* but the admin can override.

## 5. Commit path

Existing `importHistoricalTimesheets` / `importHistoricalDailyNotes` already accept row arrays — no signature change. The grid emits the edited, deduped, resolved row set to those functions unchanged.

## Files touched

- `src/lib/smart-import-nectar-mapping.functions.ts` — sample shape, fill_rate, multi-sheet, per-row person flag.
- `src/lib/smart-import-duplicate-check.functions.ts` — new.
- `src/components/smart-import/shared/review-grid.tsx` — new.
- `src/components/smart-import/shared/use-review-state.ts` — new (overlay + bulk-fix state).
- `src/components/smart-import/timesheets/timesheets-import-wizard.tsx` — swap parser to xlsx, mount new grid.
- `src/components/smart-import/daily-notes/daily-notes-import-wizard.tsx` — same.

No DB migration. No changes to commit functions, no touching client/employee import types.

## Technical notes

- Deep sample capped at 60 values/column and 2,000 rows scanned to keep the NECTAR payload bounded regardless of file size.
- Roster fetch stays the two-query pattern (organization_members → profiles, join in JS) already fixed last turn.
- Grid virtualization keeps 5,000-row imports at 60fps.
- Duplicate check uses `IN (client_ids)` + date-range filter, one query per 500 rows.
