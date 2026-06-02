
-- EVV Reconciliation: admin review/attest layer for shifts with out-of-geofence punches.
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS reconciliation_status text
    CHECK (reconciliation_status IN ('pending','accepted','flagged')),
  ADD COLUMN IF NOT EXISTS reconciliation_attestation text,
  ADD COLUMN IF NOT EXISTS reconciliation_review_notes text,
  ADD COLUMN IF NOT EXISTS reconciliation_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reconciliation_reviewed_at timestamptz;

-- Auto-mark shifts as needing reconciliation when an out-of-geofence reason is
-- recorded (and the punch did NOT match an admin-approved location).
CREATE OR REPLACE FUNCTION public.flag_evv_reconciliation_needed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.outside_geofence_reason IS NOT NULL
     AND length(btrim(NEW.outside_geofence_reason)) > 0
     AND NEW.matched_approved_location_id IS NULL
     AND NEW.reconciliation_status IS NULL THEN
    NEW.reconciliation_status := 'pending';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_flag_evv_reconciliation_needed ON public.evv_timesheets;
CREATE TRIGGER trg_flag_evv_reconciliation_needed
  BEFORE INSERT OR UPDATE OF outside_geofence_reason, matched_approved_location_id
  ON public.evv_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.flag_evv_reconciliation_needed();

-- Backfill existing rows.
UPDATE public.evv_timesheets
   SET reconciliation_status = 'pending'
 WHERE outside_geofence_reason IS NOT NULL
   AND length(btrim(outside_geofence_reason)) > 0
   AND matched_approved_location_id IS NULL
   AND reconciliation_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_reconciliation_status
  ON public.evv_timesheets (organization_id, reconciliation_status)
  WHERE reconciliation_status IS NOT NULL;
