# Fix: Duration doesn't update after editing clock times

## What's actually happening

The Duration column on Documentation > Records is not computed from the raw clock-in/clock-out times. It uses the *billing* time precedence (records-tab.tsx):

1. approved correction times, else
2. the rounded (nearest quarter-hour) punch times, else
3. raw punch times

When an admin edits clock-in/clock-out in the record detail view, only the raw timestamps change. The record's stored rounded times (written when the shift was originally clocked) stay at their old values, so the Duration keeps using them and never moves. The EDITED badge and the saved times are correct — the duration is reading a different, now-stale pair of columns.

## The fix

In the record detail save path: when the admin changes clock-in or clock-out and does not separately hand-enter the rounded times, recompute the rounded times from the new punch times using the existing quarter-hour rounding helper, and save them alongside. This keeps the record internally consistent: duration, billable units, and exports all follow the edited times instead of the original punch.

Behavior details:
- If the admin explicitly edits a rounded time field, their entry wins — no auto-overwrite.
- If clock-out is cleared, the matching rounded clock-out is cleared too.
- Recomputed rounded values are diffed and appended to the edit audit history like any other field, so the change is attributable.
- Raw timestamps continue to be stored untouched as entered; nothing is derived back into them.

After saving, the records list already invalidates and refetches, so the row's Duration updates immediately.

## Technical notes

- `src/components/records/record-detail-sheet.tsx` — in the `save` mutation, derive `rounded_clock_in` / `rounded_clock_out` from the new punch times via `roundToQuarterHourISO` (`src/lib/time-rounding.ts`) when the rounded inputs weren't dirtied by the user; track dirty state for those two inputs.
- `src/components/records/records-tab.tsx` — no change to the duration precedence; it stays aligned with the billing/export precedence used by `reDownloadBatch`.
- Audit trail is handled automatically by `saveRecordFields` in `src/lib/records-edit.ts`, which diffs every field in `updates`.
