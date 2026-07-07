## Historical Timesheets — third Smart Import mode

Add a **Timesheets** mode alongside the existing Client / Employee modes on `/dashboard/smart-import`. It's spreadsheet-only (CSV / XLSX), uses explicit column mapping and staff+client matching against existing records, and produces `evv_timesheets` rows that are permanently and visibly marked as historical imports. Existing Client and Employee import flows are untouched. Daily logs are untouched.

### 1. Mode switch

`SmartImportPage` gets a third button in the Mode switch: `Client | Employee | Timesheets`. Selecting Timesheets swaps the entire body for a new, self-contained `TimesheetsImportWizard` component. The existing PDF/DOCX/roster flow is not reused — no AI extraction, no `runSmartExtraction`, no `smart-import-review` page.

### 2. Wizard flow (client-side, four steps)

```text
Upload → Map columns → Match & review → Commit
```

**Step 1 — Upload.** Accept exactly one `.csv`, `.xlsx`, or `.xls` file (PDF/DOCX rejected with a message pointing back to the existing Client/Employee flows). Parse with the existing `papaparse` / `xlsx` code path already in `smart-import.index.tsx`.

**Step 2 — Map columns.** Show the file's detected headers and let the user assign each of six target fields to a source column via `<Select>`s:

- Staff (required)
- Client (required)
- Date (required)
- Clock in (required)
- Clock out (required)
- Notes (optional)

Auto-suggest a mapping from header names (case/space-insensitive contains: "staff|employee|worker", "client|member|consumer|recipient", "date", "in|start", "out|end", "note|comment") but every column must be re-confirmed — nothing is assumed. Also expose a small "date+time in one column" toggle so a single "Shift start" column can fill both Date and Clock-in.

**Step 3 — Match & review.** Run matching entirely client-side against `profiles` + `organization_members` (staff) and `clients` (client) already loaded for the org. Build a per-row match result:

- `matched` — exactly one confident match on both staff and client
- `ambiguous` — >1 candidate on either side (same or similar name)
- `no_match` — 0 candidates on either side
- `invalid` — bad date/time, clock-out ≤ clock-in, missing required cells

Matching is name-based only (normalized full name, then last+first, then first-initial + last). No fuzzy-below-threshold auto-picks — anything not clearly one candidate is `ambiguous`. **Never create staff or clients** from this import, even for `no_match` — the wizard makes that impossible; there is no "create new" button anywhere in this flow.

Review UI has three grouped tables (badge counts in tabs):

- **Ready to import** (`matched`, valid) — read-only preview of exactly what will land.
- **Needs a choice** (`ambiguous`) — each row shows the candidates in a `<Select>`; picking one moves the row into Ready. Also has a "Skip" action.
- **Not matched / invalid** (`no_match` + `invalid`) — for each row, two actions:
  - **Link manually** — a searchable picker over all existing staff/clients (nickname/typo cases). Never creates records.
  - **Skip**.

A **Download skipped rows (CSV)** button exports every row currently marked Skip plus every row still unresolved, with the original columns plus a `skip_reason` column, so the user can fix the underlying staff/client via the existing Employee/Client imports and re-run this import against the leftovers.

**Step 4 — Commit.** A single confirm button ("Import N historical timesheets") writes the Ready rows via a new server function; anything Skipped or unresolved is not written. On success, navigate to a summary showing counts and a link to `Import history`.

### 3. Persistence & the "historical" marker

- New server function `importHistoricalTimesheets` (in `src/lib/smart-import-timesheets.functions.ts`) — `requireSupabaseAuth` middleware, org-scoped, validates each row again server-side (staff/client belong to the org; times parseable; clock_out > clock_in), then bulk-inserts into `evv_timesheets`.
- Inserted rows carry a permanent, queryable marker so no downstream code confuses them with live punches. Migration adds:
  - `evv_timesheets.import_source text` (nullable; set to `'historical_import'` for these rows, `null` for live punches)
  - `evv_timesheets.import_job_id uuid` (nullable, FK to `import_jobs.id`)
  - partial index on `(organization_id, import_source)` for the badge.
- Each row is inserted with `shift_entry_type='historical_import'` if the check-constraint allows a new value (added in the same migration if not), `status='Approved'` (imported history is not pending review), `gps_validated=false`, `is_out_of_bounds=false`, `attested_accurate=false`, `nectar_drafted=false`, `shift_note_text` from the Notes column, and `edit_audit_history_log` seeded with a `{ kind: 'historical_import', job_id, imported_by, imported_at, source_row: <original row> }` entry so provenance is preserved forever.
- A single `import_jobs` row is created up front with `mode='timesheets'` (add `'timesheets'` to the mode check) so it appears in the existing `Import history` list.

### 4. Visual "historical import" treatment (permanent)

Every surface that renders a timesheet row must show a distinct badge when `import_source = 'historical_import'`:

- Timeclock / EVV list rows: an amber `Historical import` pill next to the timestamp, plus a muted background stripe on the row.
- Timesheet detail dialogs: a banner at the top — "This is an imported historical record from `<filename>` on `<date>` by `<user>`. It did not happen live on HIVE."
- Filters on the timeclock/EVV pages get a `Historical only / Live only / All` toggle.

This is a **presentation-layer add** wired through a small `useIsHistoricalTimesheet(row)` helper and a shared `<HistoricalTimesheetBadge />` component reused everywhere `evv_timesheets` rows render. Live-punch code paths (clock-in/out) never write `import_source`.

### 5. Files

**New**
- `src/components/smart-import/timesheets/timesheets-import-wizard.tsx` (all four steps in one file — a stepper with local state)
- `src/components/smart-import/timesheets/historical-timesheet-badge.tsx`
- `src/lib/smart-import-timesheets.functions.ts` (`importHistoricalTimesheets` server fn)
- Migration: add `import_source`, `import_job_id`, index; extend `import_jobs.mode` and `evv_timesheets.shift_entry_type` check constraints to allow the new values.

**Edited**
- `src/routes/dashboard.smart-import.index.tsx` — add the third mode button; when `mode==='timesheets'`, render `<TimesheetsImportWizard />` instead of the existing drop-zone/process flow. The existing Client/Employee code paths are not modified.
- Timeclock / EVV list + detail components — render `<HistoricalTimesheetBadge />` when the row is historical, and add the Historical/Live filter toggle. (Exact files: `src/components/evv/*` list + detail, `src/routes/dashboard.timeclock.tsx`, `src/routes/dashboard.evv-archive.tsx`.)

### 6. Out of scope

- No changes to Client Smart Import, Employee Smart Import, `smart-import-review`, or any AI extraction path.
- No changes to daily logs.
- No PDF/image ingestion for timesheets.
- No auto-creation of staff or clients under any circumstance.
- No changes to live clock-in / clock-out.

### Technical notes

- Matching normalization: lowercase, strip diacritics, collapse whitespace, drop punctuation. Compare full name, then `last, first`, then `first_initial + last`. A row is `matched` only if exactly one candidate survives on both sides.
- Date/time parsing: accept ISO, US `M/D/YYYY [h:mm[:ss] am/pm]`, and Excel serials (xlsx gives us `Date` objects when `cellDates:true`). Server function re-validates and rejects rows the client thought were valid but aren't.
- All writes go through the server function under `requireSupabaseAuth`; RLS on `evv_timesheets` already scopes by org, and we add a permission gate mirroring the existing `manage_users` check used by the Smart Import route.