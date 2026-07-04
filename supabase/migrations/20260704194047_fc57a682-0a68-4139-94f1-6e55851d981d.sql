
-- Agreements requirements + per-org instances
CREATE TABLE public.agreement_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  required boolean NOT NULL DEFAULT true,
  renewal_period_months int,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agreement_requirements TO authenticated;
GRANT ALL ON public.agreement_requirements TO service_role;
ALTER TABLE public.agreement_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exec read agreement reqs" ON public.agreement_requirements
  FOR SELECT TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec manage agreement reqs" ON public.agreement_requirements
  FOR ALL TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE TRIGGER trg_agreement_requirements_updated
  BEFORE UPDATE ON public.agreement_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  CREATE TYPE agreement_status AS ENUM ('not_started','sent','signed','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.organization_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.agreement_requirements(id) ON DELETE RESTRICT,
  status agreement_status NOT NULL DEFAULT 'not_started',
  file_path text,
  signed_date date,
  expiration_date date,
  renewal_due_date date,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, requirement_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_agreements TO authenticated;
GRANT ALL ON public.organization_agreements TO service_role;
ALTER TABLE public.organization_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exec read org agreements" ON public.organization_agreements
  FOR SELECT TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec manage org agreements" ON public.organization_agreements
  FOR ALL TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE TRIGGER trg_org_agreements_updated
  BEFORE UPDATE ON public.organization_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_org_agreements_org ON public.organization_agreements(organization_id);
CREATE INDEX idx_org_agreements_status ON public.organization_agreements(status);

-- Functionality reports (IT channel)
DO $$ BEGIN
  CREATE TYPE functionality_report_source AS ENUM ('self_report','auto_detect');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE functionality_report_status AS ENUM ('open','triaged','resolved','dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.functionality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source functionality_report_source NOT NULL DEFAULT 'self_report',
  screen text,
  description text NOT NULL,
  technical_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status functionality_report_status NOT NULL DEFAULT 'open',
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.functionality_reports TO authenticated;
GRANT ALL ON public.functionality_reports TO service_role;
ALTER TABLE public.functionality_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members insert own report" ON public.functionality_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND (organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id))
  );
CREATE POLICY "reporter reads own report" ON public.functionality_reports
  FOR SELECT TO authenticated USING (reported_by = auth.uid());
CREATE POLICY "exec reads all reports" ON public.functionality_reports
  FOR SELECT TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec updates reports" ON public.functionality_reports
  FOR UPDATE TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE TRIGGER trg_functionality_reports_updated
  BEFORE UPDATE ON public.functionality_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_functionality_reports_status ON public.functionality_reports(status);
CREATE INDEX idx_functionality_reports_org ON public.functionality_reports(organization_id);
