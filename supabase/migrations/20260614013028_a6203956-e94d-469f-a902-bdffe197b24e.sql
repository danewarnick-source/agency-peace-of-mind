
CREATE TABLE public.host_home_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  team_id uuid NULL,
  cert_type text NOT NULL CHECK (cert_type IN ('initial','annual')),
  inspection_date date NOT NULL,
  inspector_user_id uuid NOT NULL,
  inspector_name text NOT NULL,
  host_home_address text NOT NULL,
  inspector_not_host_confirmed boolean NOT NULL DEFAULT false,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  pcsp_status text NOT NULL CHECK (pcsp_status IN ('meets','does_not_meet')),
  pcsp_notes text,
  determination text NOT NULL CHECK (determination IN ('certified','certified_with_corrections','not_certified')),
  signature_name text NOT NULL,
  signature_title text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  guardian_acknowledgement_name text,
  next_due_date date GENERATED ALWAYS AS ((inspection_date + INTERVAL '1 year')::date) STORED,
  certificate_pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhc_org_client_date ON public.host_home_certifications (organization_id, client_id, inspection_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.host_home_certifications TO authenticated;
GRANT ALL ON public.host_home_certifications TO service_role;

ALTER TABLE public.host_home_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hhc_select_org_members" ON public.host_home_certifications
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "hhc_insert_admin_mgr" ON public.host_home_certifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "hhc_update_admin_mgr" ON public.host_home_certifications
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "hhc_delete_admin_mgr" ON public.host_home_certifications
  FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_hhc_updated_at
  BEFORE UPDATE ON public.host_home_certifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.host_home_cert_concerns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  certification_id uuid NOT NULL REFERENCES public.host_home_certifications(id) ON DELETE CASCADE,
  finding text NOT NULL,
  corrective_action text NOT NULL,
  target_date date,
  resolved_at date,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhcc_cert ON public.host_home_cert_concerns (certification_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.host_home_cert_concerns TO authenticated;
GRANT ALL ON public.host_home_cert_concerns TO service_role;

ALTER TABLE public.host_home_cert_concerns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hhcc_select_org_members" ON public.host_home_cert_concerns
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "hhcc_insert_admin_mgr" ON public.host_home_cert_concerns
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "hhcc_update_admin_mgr" ON public.host_home_cert_concerns
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "hhcc_delete_admin_mgr" ON public.host_home_cert_concerns
  FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_hhcc_updated_at
  BEFORE UPDATE ON public.host_home_cert_concerns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
