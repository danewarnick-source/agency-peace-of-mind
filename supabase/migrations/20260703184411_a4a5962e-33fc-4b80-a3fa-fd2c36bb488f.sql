CREATE TABLE public.audit_package_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_package_id uuid NOT NULL REFERENCES public.audit_packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_package_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_folders TO authenticated;
GRANT ALL ON public.audit_package_folders TO service_role;
ALTER TABLE public.audit_package_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY apf_org_admin_all
  ON public.audit_package_folders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_folders.audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_folders.audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())));

CREATE POLICY apf_auditor_read
  ON public.audit_package_folders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.audit_package_access a
    JOIN public.auditor_accounts aa ON aa.id = a.auditor_account_id
    JOIN public.audit_packages p    ON p.id = a.audit_package_id
    WHERE a.audit_package_id = audit_package_folders.audit_package_id
      AND a.revoked_at IS NULL AND aa.user_id = auth.uid()
      AND aa.status = 'active' AND p.status IN ('released','closed')
  ));

CREATE TABLE public.audit_package_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_package_id uuid NOT NULL REFERENCES public.audit_packages(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.audit_package_folders(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'audit-files',
  storage_path text NOT NULL,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_package_files_pkg_idx    ON public.audit_package_files(audit_package_id);
CREATE INDEX audit_package_files_folder_idx ON public.audit_package_files(folder_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_files TO authenticated;
GRANT ALL ON public.audit_package_files TO service_role;
ALTER TABLE public.audit_package_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY apfile_org_admin_all
  ON public.audit_package_files FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_files.audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.audit_packages p
    WHERE p.id = audit_package_files.audit_package_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())));

CREATE POLICY apfile_auditor_read
  ON public.audit_package_files FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.audit_package_access a
    JOIN public.auditor_accounts aa ON aa.id = a.auditor_account_id
    JOIN public.audit_packages p    ON p.id = a.audit_package_id
    WHERE a.audit_package_id = audit_package_files.audit_package_id
      AND a.revoked_at IS NULL AND aa.user_id = auth.uid()
      AND aa.status = 'active' AND p.status IN ('released','closed')
  ));