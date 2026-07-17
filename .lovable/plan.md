## Problem

On My Caseload (staff view), a shift that's been open a long time appears twice:
- **TodayHero** always renders the green "Shift in progress — Return to shift" card while an EVV punch is open.
- **ComplianceInbox** *also* lists it under "Needs Your Attention → Open shift · never clocked out" once the clock-in is older than 16 hours.

They should be one card. When the currently active shift has been running >12 hours, the TodayHero card itself should switch into an attention state that still reads "Shift in progress" but visibly prompts the staff member to clock out, with a "Clock out now" (Fix Now) button.

## Fix

### 1. Expose clock-in time on the active timesheet
- `src/hooks/use-today-shift.tsx`: add `clock_in_timestamp: string` to `ActiveTimesheet` and select it in `activeQuery`.

### 2. TodayHero: promote the active-shift card to an attention state past 12h
- `src/components/staff-mobile/today-hero.tsx`: in the `if (active)` branch, compute `hoursOpen = (Date.now() - Date.parse(active.clock_in_timestamp)) / 3_600_000`.
- When `hoursOpen >= 12`:
  - Swap border/background from green (`#15a06a`) to amber (`border-amber-400/60 bg-amber-500/10`) and use an `AlertTriangle` icon.
  - Eyebrow text: **"Shift in progress · Needs your attention"**.
  - Headline: **"You've been on the clock for {N}h — clock out now"** (round to whole hours).
  - Sub-line: "This shift started {date/time}. Open it and clock out to keep your timesheet accurate."
  - CTA label changes from "Return to shift" to **"Clock out now"**; keep the same link (`/dashboard/workspace/$clientId?tab=clock-in`).
- Under 12h: unchanged (green "Shift in progress / Return to shift").

### 3. ComplianceInbox: stop double-listing the currently active shift
- `src/routes/dashboard.index.tsx`: filter `openShifts` to exclude the row whose `id` matches the current `active` timesheet (fetched via `useTodayShift`). Only truly-orphaned open shifts (e.g. a second forgotten punch from a prior day that is not the active one) remain listed there.
- If after that filter both `rejectedLogs` and `openShifts` are empty, the whole "Needs Your Attention" card hides — the existing `totalItems === 0` guard already handles that.

### Out of scope
- No changes to the admin view, no changes to the underlying `evv_timesheets` schema, no auto-clock-out behavior. The staff still has to open the workspace and clock out themselves — the card only nudges them.
- The 16h cutoff in the ComplianceInbox query stays as-is for detecting long-forgotten prior shifts; deduplication is done in-memory against the active punch.

## Files touched
- `src/hooks/use-today-shift.tsx`
- `src/components/staff-mobile/today-hero.tsx`
- `src/routes/dashboard.index.tsx`
