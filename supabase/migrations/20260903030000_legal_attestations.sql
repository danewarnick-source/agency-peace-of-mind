-- Legal attestations for Terms and BAA. I-agree only — no drawn signature.
-- App records who agreed, when, IP, user agent, and document version.
-- Do not apply this live from the agent. Core runs it from SQL_HANDOFF.

CREATE TABLE IF NOT EXISTS public.legal_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('tos', 'baa')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS legal_attestations_org_type_idx
  ON public.legal_attestations (organization_id, document_type, accepted_at DESC);

COMMENT ON TABLE public.legal_attestations IS
  'TOS and BAA I-agree records. No drawn signature. Not PHI.';

ALTER TABLE public.legal_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read org legal attestations"
  ON public.legal_attestations FOR SELECT TO authenticated
  USING (
    is_org_member(organization_id, auth.uid())
    OR is_hive_executive(auth.uid())
  );

CREATE POLICY "members insert own legal attestations"
  ON public.legal_attestations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_org_member(organization_id, auth.uid())
  );
