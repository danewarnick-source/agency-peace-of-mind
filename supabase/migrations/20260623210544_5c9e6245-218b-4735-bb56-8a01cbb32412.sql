CREATE TABLE IF NOT EXISTS public.document_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK (subject_kind IN ('baseline_cert','checklist_doc','training_hours')),
  subject_ref text NOT NULL,
  hr_document_id uuid,
  attestation_text text NOT NULL,
  attested_by uuid NOT NULL REFERENCES auth.users(id),
  attested_by_name text,
  attested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.document_attestations TO authenticated;
GRANT ALL ON public.document_attestations TO service_role;

ALTER TABLE public.document_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read attestations"
  ON public.document_attestations FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins/managers insert attestations"
  ON public.document_attestations FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND attested_by = auth.uid()
  );

CREATE INDEX IF NOT EXISTS document_attestations_org_staff_idx
  ON public.document_attestations (organization_id, staff_id, attested_at DESC);