
-- Smart Import: staging + provisioning rules foundation
-- All org-scoped, RLS on. Admins manage; org members can read where relevant.

-- 1) import_jobs
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','committed','discarded')),
  source_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ,
  committed_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_jobs admin manage" ON public.import_jobs FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- 2) import_documents
CREATE TABLE public.import_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_documents TO authenticated;
GRANT ALL ON public.import_documents TO service_role;
ALTER TABLE public.import_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_documents admin manage" ON public.import_documents FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- 3) extracted_fields
CREATE TABLE public.extracted_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  target_field TEXT NOT NULL,
  value TEXT,
  status TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('placed','review','flag','edited','ignored')),
  confidence NUMERIC,
  source_document_id UUID REFERENCES public.import_documents(id) ON DELETE SET NULL,
  source_snippet TEXT,
  provenance TEXT NOT NULL DEFAULT 'inferred' CHECK (provenance IN ('rule','source','inferred'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_fields TO authenticated;
GRANT ALL ON public.extracted_fields TO service_role;
ALTER TABLE public.extracted_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extracted_fields admin manage" ON public.extracted_fields FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- 4) unfiled_items
CREATE TABLE public.unfiled_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_document_id UUID REFERENCES public.import_documents(id) ON DELETE SET NULL,
  filed_to TEXT,
  filed_by UUID,
  filed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unfiled_items TO authenticated;
GRANT ALL ON public.unfiled_items TO service_role;
ALTER TABLE public.unfiled_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unfiled_items admin manage" ON public.unfiled_items FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- 5) provisioning_rules
CREATE TABLE public.provisioning_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('service_code','keyword','data_present')),
  trigger_value TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('enable_feature','create_draft','seed_record')),
  target_module TEXT NOT NULL CHECK (target_module IN ('time_clock','daily_logs','med_mgmt','incident_reporting','behavior_plan')),
  default_state TEXT NOT NULL DEFAULT 'active' CHECK (default_state IN ('active','draft')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_rules TO authenticated;
GRANT ALL ON public.provisioning_rules TO service_role;
ALTER TABLE public.provisioning_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provisioning_rules admin manage" ON public.provisioning_rules FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- 6) provisioning_plan
CREATE TABLE public.provisioning_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.provisioning_rules(id) ON DELETE SET NULL,
  target_module TEXT NOT NULL,
  planned_action TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'will_create' CHECK (state IN ('will_create','draft','added_by_admin','na')),
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_plan TO authenticated;
GRANT ALL ON public.provisioning_plan TO service_role;
ALTER TABLE public.provisioning_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provisioning_plan admin manage" ON public.provisioning_plan FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- 7) import_audit
CREATE TABLE public.import_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  traces_to TEXT,
  actor TEXT,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_audit TO authenticated;
GRANT ALL ON public.import_audit TO service_role;
ALTER TABLE public.import_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_audit admin read" ON public.import_audit FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));
CREATE POLICY "import_audit admin insert" ON public.import_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::app_role));

-- Indexes
CREATE INDEX idx_import_jobs_org ON public.import_jobs(org_id);
CREATE INDEX idx_import_documents_job ON public.import_documents(import_job_id);
CREATE INDEX idx_extracted_fields_job ON public.extracted_fields(import_job_id);
CREATE INDEX idx_unfiled_items_job ON public.unfiled_items(import_job_id);
CREATE INDEX idx_provisioning_rules_org ON public.provisioning_rules(org_id);
CREATE INDEX idx_provisioning_plan_job ON public.provisioning_plan(import_job_id);
CREATE INDEX idx_import_audit_job ON public.import_audit(import_job_id);

-- Storage RLS for new private bucket (bucket itself is created via tool)
CREATE POLICY "import-documents admin read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'import-documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','super_admin')
        AND (storage.foldername(name))[1] = om.organization_id::text
    )
  );
CREATE POLICY "import-documents admin write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'import-documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','super_admin')
        AND (storage.foldername(name))[1] = om.organization_id::text
    )
  );
CREATE POLICY "import-documents admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'import-documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','super_admin')
        AND (storage.foldername(name))[1] = om.organization_id::text
    )
  );
CREATE POLICY "import-documents admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'import-documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','super_admin')
        AND (storage.foldername(name))[1] = om.organization_id::text
    )
  );
