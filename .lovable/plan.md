# Phase 3 — Open Shifts, Swaps, Time-Off, Templates

Four batches, each independently shippable. Reuses existing tables (`shift_swap_requests`, `time_off_requests`, `shift_templates`) and extends `scheduled_shifts.status`.

## Batch A — Open shifts & claim workflow
- `scheduled_shifts.status` accepts `'open'` (no staff assigned). `ShiftCreateDialog` adds "Leave unassigned (open shift)" toggle.
- New server fns in `src/lib/scheduling/open-shifts.functions.ts`:
  - `listOpenShifts(range)` — open shifts in window, joined with eligibility (matching cert, no conflict for the caller).
  - `claimOpenShift({ shiftId })` — staff self-claims; sets `staff_id`, status → `'pending'` (admin review).
  - `approveClaim({ shiftId, approve })` — admin confirms claim → `'accepted'`, or reverts to `'open'`.
- Board: "Open shifts" card lists posted opens with **Assign** action; deep-links to editor.
- Staff agenda: new "Open shifts" section above Today with **Claim** button. Conflict engine filters out shifts the staffer can't legally take.

## Batch B — Swap requests
- Reuses `shift_swap_requests` (existing). Server fns `src/lib/scheduling/swaps.functions.ts`:
  - `requestSwap({ shiftId, withStaffId?, reason })` — find eligible partners (same code, no conflict); create request.
  - `respondToSwap({ requestId, accept })` — partner accepts → admin queue; admin `approveSwap` swaps `staff_id` atomically.
- Staff agenda: "Request swap" on any accepted shift → picker of eligible coworkers.
- Board "Action needed" card already created in Phase 2 — extend to list pending swaps with approve/deny.

## Batch C — Time-off requests & blackout
- Reuses `time_off_requests`. Server fns `src/lib/scheduling/time-off.functions.ts`:
  - `requestTimeOff({ startsAt, endsAt, reason })`
  - `decideTimeOff({ requestId, approve, note })`
  - `listApprovedTimeOff(range)` — used by conflict engine.
- Conflict engine: new HARD rule `staff_on_approved_pto` when shift overlaps approved time-off.
- Staff agenda: "Request time off" button → dialog. Shows pending/approved list.
- Admin "Action needed": pending PTO rows with approve/deny + optional note.

## Batch D — Templates & copy-week
- Reuses `shift_templates` (already keyed to org). New `src/lib/scheduling/week-templates.functions.ts`:
  - `saveWeekAsTemplate({ weekStartIso, name })` — captures every shift in the visible week into a template payload (jsonb on `shift_templates.template_data`).
  - `applyWeekTemplate({ templateId, targetWeekStartIso })` — materializes shifts as drafts, shifted to the target week, preserving staff/client/code/time.
  - `copyPreviousWeek({ targetWeekStartIso })` — convenience: reads previous week, applies as drafts to target.
- Board toolbar: "Copy from…" menu → Previous week / Save template / Apply template.
- All new shifts land as `'draft'`, then run through Phase 2 publish flow.

## Files

**New**:
- `src/lib/scheduling/open-shifts.functions.ts`
- `src/lib/scheduling/swaps.functions.ts`
- `src/lib/scheduling/time-off.functions.ts`
- `src/lib/scheduling/week-templates.functions.ts`
- `src/components/scheduling/open-shifts-panel.tsx`
- `src/components/scheduling/swap-request-dialog.tsx`
- `src/components/scheduling/time-off-dialog.tsx`
- `src/components/scheduling/copy-week-menu.tsx`

**Edited**:
- `src/lib/scheduling/conflicts.ts` (PTO hard rule)
- `src/components/scheduling/shift-create-dialog.tsx` (open-shift toggle)
- `src/components/scheduling/action-needed-card.tsx` (swap + PTO rows)
- `src/routes/dashboard.schedule-preview.tsx` (open-shifts panel + copy-week menu)
- `src/routes/dashboard.schedule.tsx` (claim / swap / PTO actions)

**Migration**: extend `scheduled_shifts.status` allowed values (no schema change needed if `text`); add `claimed_by` column? — not needed, `staff_id` + `'pending'` status conveys it.

Starting Batch A now. Say "next" to advance through B → C → D.
