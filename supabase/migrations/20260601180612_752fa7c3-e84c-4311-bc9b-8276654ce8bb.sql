
-- Foundation Prompt B: SOW/contract authoritative sources, derived requirements, attestation log

-- 1. Mark documents as authoritative sources (SOW, contracts, state requirement docs)
ALTER TABLE public.nectar_documents
  ADD COLUMN IF NOT EXISTS is_authoritative_source BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authoritative_kind TEXT;
-- authoritative_kind: 'state_sow' | 'provider_contract' | 'dspd_requirement' | 'dhs_requirement' | 'public_record' | 'other'

CREATE INDEX IF NOT EXISTS idx_nectar_documents_authoritative
  ON public.nectar_documents (organization_id, is_authoritative_source)
  WHERE is_authoritative_source = true;

-- 2. Derived requirements — NECTAR-extracted checklist items tied to a source document + citation
CREATE TABLE IF NOT EXISTS public.nectar_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  source_document_id UUID REFERENCES public.nectar_documents(id) ON DELETE SET NULL,
  -- when source_document_id is null, this is unverified/manual or a NECTAR suggestion
  origin TEXT NOT NULL DEFAULT 'document', -- 'document' | 'suggestion' | 'manual'
  requirement_key TEXT NOT NULL,           -- e.g. 'pcsp_on_file', 'els_daily_cap_24u'
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,                            -- 'audit_doc' | 'obligation' | 'rule' | 'billing'
  source_citation TEXT,                     -- "SOW §3.1", "Contract clause 7", null if unverified
  applies_to TEXT,                          -- 'company' | 'client' | 'staff' | 'shift' | etc
  verified BOOLEAN NOT NULL DEFAULT false,  -- company confirmed this requirement
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_requirements TO authenticated;
GRANT ALL ON public.nectar_requirements TO service_role;

ALTER TABLE public.nectar_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view requirements"
  ON public.nectar_requirements FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins can insert requirements"
  ON public.nectar_requirements FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins can update requirements"
  ON public.nectar_requirements FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins can delete requirements"
  ON public.nectar_requirements FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_nectar_requirements_org ON public.nectar_requirements (organization_id);
CREATE INDEX IF NOT EXISTS idx_nectar_requirements_source ON public.nectar_requirements (source_document_id);

CREATE TRIGGER trg_nectar_requirements_updated
  BEFORE UPDATE ON public.nectar_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Immutable attestation log — every confirmation the company makes
CREATE TABLE IF NOT EXISTS public.nectar_attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  user_display_name TEXT,
  scope TEXT NOT NULL,            -- 'document_upload' | 'requirement_verify' | 'audit_packet' | 'form_submission' | 'billing_520' | 'generic'
  scope_ref_id UUID,              -- id of the related entity
  scope_ref_type TEXT,            -- e.g. 'nectar_document', 'nectar_requirement', 'audit_packet'
  statement TEXT NOT NULL,        -- the exact text the user attested to
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.nectar_attestations TO authenticated;
GRANT ALL ON public.nectar_attestations TO service_role;

ALTER TABLE public.nectar_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view attestations"
  ON public.nectar_attestations FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Authenticated users can insert their own attestations"
  ON public.nectar_attestations FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND user_id = auth.uid()
  );

-- Immutability: block UPDATE and DELETE via trigger
CREATE OR REPLACE FUNCTION public.nectar_attestations_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'nectar_attestations is append-only and immutable.';
END;
$$;

CREATE TRIGGER trg_nectar_attestations_no_update
  BEFORE UPDATE ON public.nectar_attestations
  FOR EACH ROW EXECUTE FUNCTION public.nectar_attestations_immutable();

CREATE TRIGGER trg_nectar_attestations_no_delete
  BEFORE DELETE ON public.nectar_attestations
  FOR EACH ROW EXECUTE FUNCTION public.nectar_attestations_immutable();

CREATE INDEX IF NOT EXISTS idx_nectar_attestations_org ON public.nectar_attestations (organization_id, attested_at DESC);
CREATE INDEX IF NOT EXISTS idx_nectar_attestations_scope ON public.nectar_attestations (scope, scope_ref_id);
