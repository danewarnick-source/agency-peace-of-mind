ALTER TABLE public.evv_timesheets DROP CONSTRAINT IF EXISTS evv_timesheets_reconciliation_status_check;
ALTER TABLE public.evv_timesheets ADD CONSTRAINT evv_timesheets_reconciliation_status_check
  CHECK (reconciliation_status IS NULL OR reconciliation_status = ANY (ARRAY['pending'::text,'accepted'::text,'corrected'::text,'flagged'::text]));
COMMENT ON COLUMN public.evv_timesheets.reconciliation_status IS 'EVV geofence-exception review outcome: pending | accepted | corrected | flagged. NULL = no exception.';