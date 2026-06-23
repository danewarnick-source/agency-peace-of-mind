CREATE TABLE IF NOT EXISTS public.import_merge_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  field text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('possible_duplicate','scalar_conflict')),
  existing_value text,
  incoming_value text,
  suggested_value text,
  source_document_type text,
  resolved_action text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_merge_flags TO authenticated;
GRANT ALL ON public.import_merge_flags TO service_role;

ALTER TABLE public.import_merge_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read merge flags" ON public.import_merge_flags
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org members insert merge flags" ON public.import_merge_flags
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org members update merge flags" ON public.import_merge_flags
  FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org members delete merge flags" ON public.import_merge_flags
  FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_import_merge_flags_client_unresolved
  ON public.import_merge_flags (organization_id, client_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.import_subjects
  ADD COLUMN IF NOT EXISTS validation_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;