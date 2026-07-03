CREATE TABLE public.master_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INT NOT NULL,
  scope_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  requirement_count INT NOT NULL DEFAULT 0,
  attestation_text TEXT NOT NULL,
  signed_by UUID NOT NULL,
  signed_by_name TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ NULL
);

GRANT SELECT, INSERT ON public.master_attestations TO authenticated;
GRANT ALL ON public.master_attestations TO service_role;

ALTER TABLE public.master_attestations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS master_attestations_org_version_idx
  ON public.master_attestations (organization_id, version DESC);

CREATE POLICY "Org members can read master attestations"
  ON public.master_attestations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admins/managers can sign master attestations"
  ON public.master_attestations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));