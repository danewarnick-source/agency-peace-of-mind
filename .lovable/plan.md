## Goal
Give staff a real end-to-end path to request a time correction on the Submit Final Timesheet screen, route the request to a supervisor who can actually approve/deny it, apply the corrected times to the shift on approval, and let the staff member see status.

## What already exists (verified in code)
- `evv_timesheets` columns: `corrected_clock_in`, `corrected_clock_out`, `edit_reason`, `review_status`, `review_note`, `reviewed_by`, `reviewed_at`, `edit_audit_history_log`.
- `src/lib/billing-units.ts` already treats `corrected_clock_in/out` as effective ONLY when `review_status='approved'` — so approving a correction automatically flips billing to the corrected times without touching raw punches.
- `dashboard.compliance-desk.tsx` "Needs Review" tab already lists rows where `review_status='needs_review'`, shows original vs corrected times side-by-side and `edit_reason`, and has approve (sets `review_status='approved'`) and reject with required reviewer note (sets `rejected`).
- `punch-pad.tsx` already has unused state (`correction`, `forgotOpen`, `forgotIn`, `forgotOut`, `forgotReason`) and a comment describing this exact intended flow — but no UI or submit wiring.

So the DB, billing math, and supervisor screen are all in place. The gap is entirely on the staff side (request UI, submit wiring, status view).

## What to build

### 1. Staff correction UI on the Submit Final Timesheet screen
In `src/components/evv/punch-pad.tsx`, in the submit dialog footer (near the amber long-shift banner), add a "Request time correction" secondary button that opens a small in-dialog panel with:
- Current recorded clock-in (read-only, for reference)
- Current recorded clock-out (read-only)
- Two `datetime-local` inputs for proposed corrected in / out (either or both may be edited; unchanged means "this one is fine")
- A required reason textarea (≥10 chars)
- Cancel / "Submit correction request" actions

Reuse the existing `correction` / `forgotIn` / `forgotOut` / `forgotReason` state (rename to a single `correctionDraft` for clarity). Validate: at least one of in/out must actually differ from the recorded time; corrected out must be after corrected in; correction window can't extend more than 24h past clock-in.

Replace the current "don't submit — tell your supervisor" copy on the long-shift amber banner with a direct "Request a time correction" button that opens the same panel.

### 2. Submit path for a correction
Extend `finalizeClockOut` to accept an optional `correction: { correctedIn?: string; correctedOut?: string; reason: string }` and, when present, add to the update object:
- `corrected_clock_in` / `corrected_clock_out` (only the field(s) the staff changed)
- `edit_reason` (the reason)
- `review_status: 'needs_review'`
- `edited_by: user.id`, `edited_at: now`
- Append an entry to `edit_audit_history_log` describing `{ kind: 'staff_correction_request', requested_by, requested_at, from: {...}, to: {...}, reason }`

Route the "Submit correction request" button through `submitCompliance({ correction })` so it still passes the existing gates (narrative, goals, med check, incident, NECTAR coach). On success, toast "Correction request sent to your supervisor" and close the dialog.

### 3. Staff status visibility
Add `src/routes/dashboard.my-time-corrections.tsx` (under the authenticated dashboard) showing the current staff member's own timesheets where `edit_reason IS NOT NULL` AND `review_status IN ('needs_review','approved','rejected')`, most recent first. Columns: client · service · original in/out · requested in/out · reason · status badge · reviewer note (if rejected) · reviewed_at.

Add a nav entry under the staff/employee dashboard sidebar section (matching the existing pattern for `dashboard.my-historical-timesheets.tsx`). Also surface a small "Correction pending / approved / needs another try" badge on the punch-pad's recent-shifts strip so staff see status without navigating.

### 4. Supervisor screen touch-up (small)
The compliance-desk "Needs Review" tab already handles the row, but two small changes:
- On the row card, when `edit_reason` was set by a staff correction (detectable via the audit-log entry's `kind`), label the block "Staff-requested correction" so supervisors know this came from the caregiver, not from a system flag (incident / 16h / etc.).
- On approve success toast, keep the existing wording; on reject, add a line that the staff member will see the reviewer note in their My Time Corrections screen.

## Files touched
- `src/components/evv/punch-pad.tsx` — correction panel UI, wire `finalizeClockOut` + `submitCompliance` to accept correction, replace long-shift banner CTA.
- `src/routes/dashboard.my-time-corrections.tsx` — new route.
- Sidebar/nav file that lists `dashboard.my-historical-timesheets` — add link.
- `src/routes/dashboard.compliance-desk.tsx` — label tweak for staff-originated corrections.

## Out of scope
- No DB migration (columns already exist).
- No changes to `billing-units.ts` (approval-gated corrected-times logic already correct).
- No changes to raw `clock_in_timestamp` / `clock_out_timestamp` — those stay immutable; corrections live in the corrected columns and take effect via `review_status='approved'`.
