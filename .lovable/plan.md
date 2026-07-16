## Replace guess-a-mapping with a fixed six-column template

Kill the column-mapping screen and the Nectar auto-suggest path. The wizard now ships a canonical template and only accepts files that follow it.

### The template
Six columns, in this exact order, one header row:

```text
Staff Name | Client Name | Clock In | Clock Out | Service Code | Notes
```

- Clock In / Clock Out are single cells each, holding date + time together (e.g. `2026-05-14 08:00`, `5/14/2026 8:00 AM`). No separate date column.
- Notes is optional; the other five are required per row.
- Downloadable as both `.csv` and `.xlsx` from the Step 1 screen.

### Wizard flow (4 steps → 3 steps)
1. **Upload** — file picker + "Download template (CSV / Excel)" buttons and a one-line explainer that only files matching this template are accepted.
2. **Review** — the existing review table (matched / needs attention / invalid, per-row staff/client override, skip toggle, duplicate flagging). No mapping UI.
3. **Done** — unchanged.

### Parsing rules
- After `parseFile`, validate that the header row matches the six expected labels (case-insensitive, trimmed). Reject the file with a clear "Doesn't match the template — download it above and fill it in" error, and bounce back to Step 1.
- Build `ReviewRow`s directly from fixed column keys — no `Mapping`, no `singleDateTimeIn/Out`, no whole-file staff/client override, no Nectar suggestion round-trip.
- Reuse `findCandidates`, `personNorms`, `tryParseDateTime` unchanged. `tryParseDateTime` is called with `singleField=true` for both clock in and clock out.
- Reuse the duplicate-check pass unchanged.

### Files to change
- **`src/components/smart-import/timesheets/timesheets-import-wizard.tsx`** — remove Step 2 markup + `Mapping` / `WholeFile` / `FieldSuggestion` state, remove `suggestImportColumnMapping` and `sampleColumns`, remove `mapping` and `wholeFile` from `buildReviewRows`, add header validation in `onPickFile` that jumps straight to Step 2 (Review) on success. Renumber the stepper to 1/2/3.
- **New `src/lib/historical-timesheets-template.ts`** — exports the column list, a `buildTemplateCsv()` returning a small CSV string with the header row + 1 example row, and a `buildTemplateXlsx()` returning a Blob via the already-installed `xlsx` package. Also exports `validateTemplateHeaders(headers): { ok: true } | { ok: false; message: string }`.
- **Nothing to change server-side.** `importHistoricalTimesheets` already takes resolved rows and doesn't know about the mapping step.

### Not changing
- `suggestImportColumnMapping` server function still exists for other importers (daily notes, etc.) — leave it alone; only the timesheet wizard stops calling it.
- No changes to the duplicate check, the review table UI, the commit step, or the schema.
- No migration for existing in-flight `import_jobs`.

### Acceptance
- Step 1 shows "Download template" buttons that produce a CSV and an XLSX with exactly those six headers.
- Uploading a file whose header row doesn't match gets rejected before any matching happens, with a message pointing to the template.
- Uploading a filled-in template goes straight to the existing review screen — no column pickers anywhere.
- Rows that don't match a staff or client are shown as "needs attention" exactly as today.
