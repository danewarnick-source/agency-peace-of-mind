
ALTER TABLE public.import_subjects
  ADD COLUMN IF NOT EXISTS committed_record_id uuid,
  ADD COLUMN IF NOT EXISTS committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commit_error text;

ALTER TABLE public.provisioning_plan
  ADD COLUMN IF NOT EXISTS committed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.import_field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  import_subject_id uuid NOT NULL REFERENCES public.import_subjects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_table text NOT NULL,
  target_record_id uuid NOT NULL,
  target_field text NOT NULL,
  source_document_id uuid REFERENCES public.import_documents(id) ON DELETE SET NULL,
  source_snippet text,
  provenance text NOT NULL DEFAULT 'source' CHECK (provenance IN ('source','inferred','rule','admin_override')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_table, target_record_id, target_field, import_job_id)
);
CREATE INDEX IF NOT EXISTS idx_provenance_record ON public.import_field_provenance(target_table, target_record_id);
CREATE INDEX IF NOT EXISTS idx_provenance_subject ON public.import_field_provenance(import_subject_id);

GRANT SELECT, INSERT ON public.import_field_provenance TO authenticated;
GRANT ALL ON public.import_field_provenance TO service_role;
ALTER TABLE public.import_field_provenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provenance admin read" ON public.import_field_provenance;
CREATE POLICY "provenance admin read" ON public.import_field_provenance
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "provenance admin insert" ON public.import_field_provenance;
CREATE POLICY "provenance admin insert" ON public.import_field_provenance
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role));
