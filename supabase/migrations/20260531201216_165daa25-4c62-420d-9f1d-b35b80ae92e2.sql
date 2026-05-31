ALTER TABLE public.client_medications
  ADD COLUMN IF NOT EXISTS purpose               text,
  ADD COLUMN IF NOT EXISTS adverse_effects       text,
  ADD COLUMN IF NOT EXISTS choking_risk          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS choking_risk_details  text,
  ADD COLUMN IF NOT EXISTS is_controlled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_prn                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prn_instructions      text,
  ADD COLUMN IF NOT EXISTS pill_count_current    integer,
  ADD COLUMN IF NOT EXISTS pill_count_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pharmacy              text,
  ADD COLUMN IF NOT EXISTS rx_number             text;

ALTER TABLE public.emar_logs
  ADD COLUMN IF NOT EXISTS is_prn               boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prn_reason           text,
  ADD COLUMN IF NOT EXISTS is_controlled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pill_count_verified  boolean,
  ADD COLUMN IF NOT EXISTS pill_count_value     integer,
  ADD COLUMN IF NOT EXISTS is_medication_error  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reviewed       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by    uuid,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS signature_data_url   text;

CREATE INDEX IF NOT EXISTS idx_emar_logs_errors
  ON public.emar_logs (organization_id, is_medication_error, admin_reviewed)
  WHERE is_medication_error = true;

DROP POLICY IF EXISTS "staff update own emar" ON public.emar_logs;
CREATE POLICY "staff update own emar"
  ON public.emar_logs FOR UPDATE TO authenticated
  USING (
    staff_id = auth.uid()
    OR is_org_admin_or_manager(organization_id, auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.notify_medication_error(
  p_organization_id uuid,
  p_emar_log_id     uuid,
  p_client_name     text,
  p_med_name        text,
  p_reporter_name   text,
  p_description     text
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
    'Medication Error Reported — Immediate Review Required',
    'Client: ' || p_client_name ||
    ' | Medication: ' || p_med_name ||
    ' | Reported by: ' || p_reporter_name ||
    ' | ' || p_description,
    '/dashboard/command-center',
    p_emar_log_id,
    'emar_log'
  );
END;
$$;