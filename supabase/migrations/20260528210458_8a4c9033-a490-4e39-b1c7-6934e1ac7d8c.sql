-- Blueprint 05: Unified MAR System

-- 1. Add missing compliance columns to emar_logs
ALTER TABLE public.emar_logs
  ADD COLUMN IF NOT EXISTS is_prn               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prn_reason           TEXT,
  ADD COLUMN IF NOT EXISTS is_controlled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pill_count_verified  BOOLEAN,
  ADD COLUMN IF NOT EXISTS pill_count_value     INTEGER,
  ADD COLUMN IF NOT EXISTS is_medication_error  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS error_description    TEXT,
  ADD COLUMN IF NOT EXISTS admin_reviewed       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by    UUID,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_review_notes   TEXT,
  ADD COLUMN IF NOT EXISTS signature_data_url   TEXT;

-- 2. Medication error indexes
CREATE INDEX IF NOT EXISTS idx_emar_logs_errors
  ON public.emar_logs (organization_id, is_medication_error, admin_reviewed)
  WHERE is_medication_error = true;

CREATE INDEX IF NOT EXISTS idx_emar_logs_unreviewed_errors
  ON public.emar_logs (organization_id, created_at DESC)
  WHERE is_medication_error = true AND admin_reviewed = false;

-- 3. Add compliance fields to client_medications
ALTER TABLE public.client_medications
  ADD COLUMN IF NOT EXISTS is_controlled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_prn               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prn_instructions     TEXT,
  ADD COLUMN IF NOT EXISTS pill_count_current   INTEGER,
  ADD COLUMN IF NOT EXISTS pill_count_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pharmacy             TEXT,
  ADD COLUMN IF NOT EXISTS rx_number            TEXT,
  ADD COLUMN IF NOT EXISTS refill_date          DATE,
  ADD COLUMN IF NOT EXISTS diagnosis            TEXT;

-- 4. notify_medication_error function for admin bell
CREATE OR REPLACE FUNCTION public.notify_medication_error(
  p_organization_id UUID,
  p_emar_log_id     UUID,
  p_client_name     TEXT,
  p_med_name        TEXT,
  p_reporter_name   TEXT,
  p_description     TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    organization_id, recipient_role, type, urgency,
    title, body, link_to, related_id, related_type
  ) VALUES (
    p_organization_id, 'admin', 'daily_log_exception', 'critical',
    '💊 Medication Error Reported — Immediate Review Required',
    'Client: ' || p_client_name ||
    ' · Medication: ' || p_med_name ||
    ' · Reported by: ' || p_reporter_name ||
    ' · ' || p_description,
    '/dashboard/command-center',
    p_emar_log_id,
    'emar_log'
  );
END;
$$;

-- 5. Allow staff to update their own emar_logs
DROP POLICY IF EXISTS "staff update own emar" ON public.emar_logs;
CREATE POLICY "staff update own emar"
  ON public.emar_logs FOR UPDATE TO authenticated
  USING (
    staff_id = auth.uid()
    OR is_org_admin_or_manager(organization_id, auth.uid())
    OR is_super_admin(auth.uid())
  );

-- 6. Add notifications type for medication errors (extend check constraint)
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'incident_report_filed',
    'incident_deadline_warning',
    'timesheet_exception',
    'daily_log_exception',
    'open_shift_warning',
    'medication_error'
  ));