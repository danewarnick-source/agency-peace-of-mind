# Fix: 30-Day New Hire Orientation still shows the old single-staff behavior

## What's confirmed

Verified against the live data for True North:

- The obligation "30-Day New Hire Orientation Training" is staff-scoped, one-time,
  due 30 days after hire, and requires each person's own completion.
- Its assigned group contains all 4 active staff (Harvey, Tom, Jake, Dane), but the
  obligation has only **one** instance in the database — Harvey's, created 2026-08-19.
  No instance was ever created for the other three.

So the picker is not showing stale UI logic here: the new multi-select roster is
reading every open instance, and there genuinely is only one. The bug is in instance
generation, not in the picker.

The generator loops staff one at a time and inserts an instance per person. Any error
mid-loop (reminder scheduling, notification insert, a rejected row) aborts the whole
run and leaves the already-created rows behind — which matches exactly one instance
existing for a 4-person group. This specific failure is not yet reproduced, so
step 1 is to reproduce it before changing behavior.

## What to do

1. **Reproduce the generation failure.** Re-run instance generation for this obligation
   and capture the actual error for the second staff member in the loop.

2. **Make per-person generation fault-tolerant.** Wrap each assignee's insert +
   assignee snapshot + reminder scheduling in its own try/catch so one bad staff row
   can't stop the rest, collect per-person failures, and surface them (count +
   reasons) instead of failing the whole obligation silently. Fix whatever the
   reproduced error turns out to be.

3. **Backfill the missing instances** for the three staff who never got one, so the
   obligation card immediately lists all outstanding staff with Select all.

4. **Delete the remaining old single-staff UI.** In
   `obligation-card-actions.tsx`, the per-client "Who's outstanding?" list still
   renders the legacy one-person `FileForInstanceButton` ("File for {name}") next to
   each row. Remove that component and the single-instance button, leaving the
   outstanding list as read-only detail — filing happens only through the multi-select
   roster panel.

5. **Sweep for other stale paths.** Confirm no remaining component builds a staff
   picker from a single `current_instance` assignee snapshot (obligation card, drawer,
   history sheet, staff-facing My Compliance page) and remove any that still do.

## Technical notes

- Generation: `generatePerPersonInstancesInternal` in
  `src/lib/company-obligations.functions.ts` (per-assignee loop, grace-period logic,
  `scheduleRemindersInternal` call).
- UI cleanup: `src/components/company-obligations/obligation-card-actions.tsx`
  (`FileForInstanceButton`, `PerClientActions` outstanding list).
- Roster stays as-is: `outstanding-roster.tsx` already gathers every open instance.
- No schema changes; the unique index already keys on
  `(obligation_id, period_key, assignee_staff_id)` so backfilled rows are safe.
