# Auto-approve a record when an admin edits its clock times

## What changes

On the Documentation > Records detail view, saving after an admin edits the clock-in or clock-out time will automatically set the record's review status to "approved". An admin hand-editing the times is itself the approval, so the status no longer stays at "clean" and the Duration column immediately reflects the new times.

If the admin didn't touch either time, the review status is saved exactly as the dropdown shows it — no behavior change.

## Technical detail

In `src/components/records/record-detail-sheet.tsx`, the save mutation already computes a `punchChanged` flag by comparing the new clock-in/clock-out against the original row values (it uses this to decide whether to recompute the rounded billing times). The same flag will now drive the review status:

- Send `review_status: punchChanged ? "approved" : reviewStatus` in the update payload.
- Sync the local `reviewStatus` state to `"approved"` after a successful save so the dropdown in the open sheet matches what was written.

No other files, no schema change, no billing-math change — the rounded/corrected time handling stays exactly as it is.

## Verification

Open a record, change the clock-in or clock-out time, save, and confirm the Duration column in the records list updates to the new duration and the record shows as approved.
