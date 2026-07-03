CREATE TABLE public.nectar_draft_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  document_id UUID NOT NULL,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'extracting',
  total_chunks INT NOT NULL DEFAULT 0,
  processed_chunks INT NOT NULL DEFAULT 0,
  chunk_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  chunk_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  inserted_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nectar_draft_jobs_org_doc
  ON public.nectar_draft_jobs (organization_id, document_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_draft_jobs TO authenticated;
GRANT ALL ON public.nectar_draft_jobs TO service_role;

ALTER TABLE public.nectar_draft_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins/managers can read draft jobs"
  ON public.nectar_draft_jobs
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can insert draft jobs"
  ON public.nectar_draft_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Org admins/managers can update draft jobs"
  ON public.nectar_draft_jobs
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER update_nectar_draft_jobs_updated_at
  BEFORE UPDATE ON public.nectar_draft_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();