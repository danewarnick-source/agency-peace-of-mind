# Finish Phase 1 — Scheduler Overhaul

Phase 1 is ~85% done. The shell, server functions, day timeline, create dialog, segment dialog, locations CRUD, coverage requirements, and weekly targets are all in place. To declare Phase 1 done per the original acceptance checks, three batches remain. I'd like to ship them sequentially because each touches `dashboard.schedule-preview.tsx` and they conflict if interleaved.

## Batch A — Locations-driven tabs + host-home row

Replace "site = team" plumbing on the All-Homes board with the real `locations` table so the LocationsDialog actually drives the board.

- Add a `useLocations` query alongside `useSchedulePreview`.
- `LocationTabs`: All Locations | each `locations` row | 1-on-1 / Community. Keep the existing team chips as a secondary filter inside a single location.
- `AllHomesBoard`:
  - Residential rows → existing `CoverageBar24h` (already wired).
  - **Host home rows** → 3 status dots (daily note done / overnight confirmed / agency visit hrs > 0) + weekly DS-hours meter via `WeeklyTargetMeter`. Never red.
  - **1:1 / community rows** → weekly target meter per code (uses `client_weekly_targets` + scheduled hours).
- Pass `locationId` (not `siteId`) into `DayTimelineDrawer` and `ShiftCreateDialog`.

## Batch B — ShiftCard variants + semantic CSS tokens

- Add `--sched-residential / --sched-supported-living / --sched-day-supports / --sched-employment / --sched-respite / --sched-other` HSL tokens to `src/styles.css` (both light + dark blocks), and export a parallel `FAMILY_VARS` map from `code-colors.ts`.
- New `ShiftCard` component (`src/components/scheduling/shift-card.tsx`):
  - dashed border if `status='draft'`
  - red border if `conflict` (overlap)
  - amber shield if `warnings>0`
  - sparkle if `created_from='nectar'`
  - inset render when `parent_shift_id` is set
- Swap the existing inline chip render in `SiteWeekGrid` and `DayTimelineDrawer` to use `ShiftCard`.

## Batch C — Recurrence + staff view status read

- `ShiftCreateDialog`: add a recurrence section (weekday checkboxes + end-on date) that, on create, calls `createShift` once per expanded date.
- `dashboard.schedule.tsx` (staff view): broaden the status filter to read the widened set (`draft|published|accepted|declined|open|cancelled`) — staff sees `published|accepted|declined` only.
- Re-run Phase 1 acceptance checks #1–#6.

## Technical details

- New file: `src/components/scheduling/shift-card.tsx`.
- Edited: `src/routes/dashboard.schedule-preview.tsx`, `src/lib/scheduling/code-colors.ts`, `src/styles.css`, `src/components/scheduling/day-timeline-drawer.tsx`, `src/components/scheduling/shift-create-dialog.tsx`, `src/routes/dashboard.schedule.tsx`.
- New hook: `src/hooks/use-host-home-status.ts` (3-dot data: daily logs / overnight confirms / agency visit hrs).
- No new tables or migrations.
- Each batch is ~150–300 LOC and typechecks independently.

## What I need from you

Approve and say which batch first (default: A → B → C). Or call out anything you want dropped or reordered.
