-- Expand evv_timesheets.status check constraint to include import-workflow values.
-- Original inline CHECK only allowed: Active, Pending, Approved, Rejected.
-- The smart-import flow also writes: in_review, Pending_Staff_Confirmation, submitted_to_staff.
ALTER TABLE public.evv_timesheets
  DROP CONSTRAINT IF EXISTS evv_timesheets_status_check;

ALTER TABLE public.evv_timesheets
  ADD CONSTRAINT evv_timesheets_status_check
  CHECK (status IN (
    'Active',
    'Pending',
    'Approved',
    'Rejected',
    'in_review',
    'Pending_Staff_Confirmation',
    'submitted_to_staff'
  ));
