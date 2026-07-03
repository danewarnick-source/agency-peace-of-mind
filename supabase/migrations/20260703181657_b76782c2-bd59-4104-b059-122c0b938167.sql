
-- ============================================================
-- State Audit Portal — tables first, then policies
-- ============================================================

CREATE TABLE public.auditor_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  agency_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditor_accounts TO authenticated;
GRANT ALL ON public.auditor_accounts TO service_role;
ALTER TABLE public.auditor_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  state_agency text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released','closed')),
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  title text,
  notes text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_packages_org_idx ON public.audit_packages(organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_packages TO authenticated;
GRANT ALL ON public.audit_packages TO service_role;
ALTER TABLE public.audit_packages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_package_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_package_id uuid NOT NULL REFERENCES public.audit_packages(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('staff','client')),
  subject_id uuid NOT NULL,
  subject_label text,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(audit_package_id, subject_type, subject_id)
);
CREATE INDEX audit_package_subjects_pkg_idx ON public.audit_package_subjects(audit_package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_subjects TO authenticated;
GRANT ALL ON public.audit_package_subjects TO service_role;
ALTER TABLE public.audit_package_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_package_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_package_id uuid NOT NULL REFERENCES public.audit_packages(id) ON DELETE CASCADE,
  auditor_account_id uuid NOT NULL REFERENCES public.auditor_accounts(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(audit_package_id, auditor_account_id)
);
CREATE INDEX audit_package_access_pkg_idx ON public.audit_package_access(audit_package_id);
CREATE INDEX audit_package_access_auditor_idx
  ON public.audit_package_access(auditor_account_id) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_access TO authenticated;
GRANT ALL ON public.audit_package_access TO service_role;
ALTER TABLE public.audit_package_access ENABLE ROW LEVEL SECURITY;

-- Helper
CREATE OR REPLACE FUNCTION public.is_active_auditor(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auditor_accounts
    WHERE user_id = _uid AND status = 'active'
  );
$$;

-- Policies: auditor_accounts
CREATE POLICY "auditor reads own account" ON public.auditor_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "executives read all auditor accounts" ON public.auditor_accounts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active));
CREATE POLICY "executives write auditor accounts" ON public.auditor_accounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active));

-- Policies: audit_packages
CREATE POLICY "org admins manage packages" ON public.audit_packages
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "auditors read granted packages" ON public.audit_packages
  FOR SELECT TO authenticated
  USING (
    status IN ('released','closed')
    AND public.is_active_auditor(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.audit_package_access apa
      JOIN public.auditor_accounts aa ON aa.id = apa.auditor_account_id
      WHERE apa.audit_package_id = audit_packages.id
        AND apa.revoked_at IS NULL
        AND aa.user_id = auth.uid()
        AND aa.status = 'active'
    )
  );

-- Policies: audit_package_subjects
CREATE POLICY "org admins manage subjects" ON public.audit_package_subjects
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));
CREATE POLICY "auditors read granted package subjects" ON public.audit_package_subjects
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.audit_packages p
    JOIN public.audit_package_access apa ON apa.audit_package_id = p.id
    JOIN public.auditor_accounts aa ON aa.id = apa.auditor_account_id
    WHERE p.id = audit_package_id
      AND p.status IN ('released','closed')
      AND apa.revoked_at IS NULL
      AND aa.user_id = auth.uid()
      AND aa.status = 'active'
  ));

-- Policies: audit_package_access
CREATE POLICY "org admins manage access" ON public.audit_package_access
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));
CREATE POLICY "auditors read own access rows" ON public.audit_package_access
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.auditor_accounts aa
    WHERE aa.id = auditor_account_id AND aa.user_id = auth.uid()
  ));

-- Triggers
CREATE TRIGGER update_auditor_accounts_updated_at
  BEFORE UPDATE ON public.auditor_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_audit_packages_updated_at
  BEFORE UPDATE ON public.audit_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
