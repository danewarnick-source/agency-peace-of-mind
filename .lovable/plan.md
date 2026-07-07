## Goal
Turn the existing historical-timesheets import (Smart Import) into four explicit, sequential stages. Every entry stays permanently marked as an imported historical record — never confused with a live clock punch. Employee, client, and daily-notes imports are not touched.

## The four stages

**Stage 1 — Upload & parse** *(admin, in wizard)*
- Existing behavior kept: CSV/XLSX upload, column mapping, name-based match against real staff/clients already in the org. Never creates new people.

**Stage 2 — Admin review** *(admin, in wizard)*
- Existing "Ready / Ambiguous / Not matched / Skipped" tabs. Admin can manually resolve or skip. Nothing is written to the database or shown to staff yet.
- The button at the bottom of review changes from "Import N timesheets" to **"Submit N entries to staff for confirmation"** — this is the *only* way to leave stage 2.

**Stage 3 — Submit to staff** *(admin click, one call)*
- The submit action inserts the reviewed rows into `evv_timesheets` with:
  - `status = 'Pending_Staff_Confirmation'` (new value; column is free text — no enum change)
  - `import_source = 'historical_import'`
  - `import_job_id` linking back to the `import_jobs` row (job status flips to `submitted_to_staff`)
  - `shift_entry_type = 'Historical_Import'`
- Nothing lands with `Approved` from the import path anymore. Staff see it only after this click.
- Wizard's Done screen becomes: "Submitted N entries to X staff members. They'll see them on their Historical Timesheets to Confirm page." with a link.

**Stage 4 — Staff confirmation** *(new page: `/dashboard/my-historical-timesheets`)*
- Each staff member sees ONLY rows where `staff_id = auth.uid()` AND `import_source = 'historical_import'` AND `status = 'Pending_Staff_Confirmation'`.
- Per row, staff can:
  - Add / edit the shift note (`shift_note_text`).
  - Flag as wrong (`staff_flagged = true`, `staff_flag_reason = <text>`) — this leaves the row in `Pending_Staff_Confirmation` but visibly flagged for admin follow-up in the wizard's job history / admin queue.
  - **Confirm** — flips `status → 'Approved'`, sets `staff_confirmed_at`, `staff_confirmed_by`. The row is then finalized.
- The existing `HistoricalTimesheetBadge` renders anywhere these entries appear (dashboards, EVV lists) so they're never mistaken for live punches.

## Permanent historical marker
The `import_source = 'historical_import'` + `shift_entry_type = 'Historical_Import'` + `import_job_id` triple is set at insert and never cleared, even after staff confirmation. The existing `HistoricalTimesheetBadge` already reads this.

## Technical notes (skip if non-technical)

### Migration
- Add columns to `public.evv_timesheets`:
  - `staff_confirmed_at timestamptz`
  - `staff_confirmed_by uuid` (references `auth.users` via app logic, no FK per project rules)
  - `staff_flagged boolean not null default false`
  - `staff_flag_reason text`
- Add index `idx_evv_timesheets_staff_pending_hist` on `(staff_id, status) where import_source='historical_import'` for the staff page.
- No change to existing RLS; existing staff-owns-their-timesheets policies already cover reads/updates. Verify + add narrow update policy only if a gap is found.

### Server functions (new in `src/lib/smart-import-timesheets.functions.ts` and a new `historical-timesheet-confirmation.functions.ts`)
- Rename intent of `importHistoricalTimesheets` → inserts with `status='Pending_Staff_Confirmation'` and updates `import_jobs.status='submitted_to_staff'` (not `committed`). Add new job status value `submitted_to_staff` (free text, no enum).
- `listMyPendingHistoricalTimesheets()` — auth'd, `staff_id = context.userId`.
- `updateMyHistoricalTimesheetNote({ id, note })` — auth'd, gated to own row + status still pending.
- `flagMyHistoricalTimesheet({ id, reason })` — same guard.
- `confirmMyHistoricalTimesheet({ id })` — sets status=Approved, staff_confirmed_at/by; gated to own row + pending.

### UI
- `timesheets-import-wizard.tsx`: relabel commit button and Done screen; no logic split — stage 3 is still one click.
- New route `src/routes/_authenticated/dashboard/my-historical-timesheets.tsx` with the confirmation list (per-row: note editor, Flag dialog, Confirm button).
- Add a sidebar/dashboard link entry point for staff (only visible when they have pending rows) — small `useQuery` count badge.

### Out of scope
- Employee, client, daily-notes import types.
- Admin's separate "review flagged confirmations" screen (flags will surface via the existing job-detail view for now; a dedicated admin follow-up screen can be a later change if needed).
- Bulk staff actions (confirm-all) — single-row confirm keeps the attestation deliberate.

## Files touched
- `supabase/migrations/…` — new columns + index.
- `src/lib/smart-import-timesheets.functions.ts` — status change + job status change.
- `src/lib/historical-timesheet-confirmation.functions.ts` — new (staff-facing fns).
- `src/components/smart-import/timesheets/timesheets-import-wizard.tsx` — button/copy relabels, Done-screen link.
- `src/routes/_authenticated/dashboard/my-historical-timesheets.tsx` — new staff page.
- Small sidebar/dashboard link addition (single file — will pick the existing nav component).

Confirm and I'll implement it end-to-end.