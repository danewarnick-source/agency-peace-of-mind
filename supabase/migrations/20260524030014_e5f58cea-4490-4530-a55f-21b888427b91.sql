CREATE TABLE IF NOT EXISTS public.submitted_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  user_id UUID NOT NULL,
  form_type TEXT NOT NULL CHECK (form_type IN ('incident_report','medical_summary','receipt_upload')),
  title TEXT NOT NULL,
  narrative TEXT,
  attachment_url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submitted_forms_client ON public.submitted_forms(client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_submitted_forms_org ON public.submitted_forms(organization_id, occurred_at DESC);

ALTER TABLE public.submitted_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own submitted forms"
  ON public.submitted_forms FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_org_member(organization_id, auth.uid()));

CREATE POLICY "users read own or managers org submitted forms"
  ON public.submitted_forms FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers update submitted forms"
  ON public.submitted_forms FOR UPDATE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers delete submitted forms"
  ON public.submitted_forms FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));