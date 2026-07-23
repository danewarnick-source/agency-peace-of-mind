-- Provider policy / procedure document kind — Authoritative Sources.
-- Adds per-document policy-acknowledgment config to nectar_documents and a
-- new policy_signatures table modeled on training_completions (real signed
-- attestation records for staff acknowledging a provider policy).

-- 1) Per-document policy config (only meaningful when
--    nectar_documents.authoritative_kind = 'provider_policy').
ALTER TABLE public.nectar_documents
  ADD COLUMN IF NOT EXISTS requires_acknowledgment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_assigned_groups  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_assigned_users    uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS policy_ack_cadence       text    NOT NULL DEFAULT 'one_time'
    CHECK (policy_ack_cadence IN ('one_time', 'annual', 'every_2_years')),
  ADD COLUMN IF NOT EXISTS gate_app_access          boolean NOT NULL DEFAULT false;

-- 2) policy_signatures — one row per staff signature event. Modeled on
--    training_completions: signer name/email captured at sign time, IP/UA/
--    timezone for the audit trail, content_hash over the signed record.
--    Never deleted — new-version re-acknowledgment archives (is_current =
--    false, archived_at = now()) rather than removing rows.
CREATE TABLE public.policy_signatures (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES public.organizations(id)     ON DELETE CASCADE,
  document_id          uuid        NOT NULL REFERENCES public.nectar_documents(id)  ON DELETE CASCADE,
  document_version     int         NOT NULL,
  user_id              uuid        NOT NULL REFERENCES auth.users(id)               ON DELETE CASCADE,
  signer_full_name     text,
  signer_email         text,
  typed_signature      text        NOT NULL,
  attestation_statement text,
  consent_statement    text,
  consent_accepted     boolean     NOT NULL DEFAULT true,
  content_version      text,
  content_hash         text,
  ip_address           text,
  user_agent           text,
  time_zone            text,
  signed_at            timestamptz NOT NULL DEFAULT now(),
  is_current           boolean     NOT NULL DEFAULT true,
  archived_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.policy_signatures TO authenticated;
GRANT ALL                    ON public.policy_signatures TO service_role;

ALTER TABLE public.policy_signatures ENABLE ROW LEVEL SECURITY;

-- Staff may read their own signature rows within their org.
CREATE POLICY "policy_signatures_select_own" ON public.policy_signatures
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

-- Admins/managers may read every signature row in their org (Signatures
-- panel, employee compliance section).
CREATE POLICY "policy_signatures_select_admin" ON public.policy_signatures
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- Staff may sign for themselves only.
CREATE POLICY "policy_signatures_insert_own" ON public.policy_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

-- No staff UPDATE/DELETE — archiving (is_current/archived_at) is an
-- admin/manager action (new-version re-acknowledgment reset), never a
-- staff self-service edit of a signed record.
CREATE POLICY "policy_signatures_update_admin" ON public.policy_signatures
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX idx_policy_signatures_org           ON public.policy_signatures(organization_id);
CREATE INDEX idx_policy_signatures_doc_current    ON public.policy_signatures(document_id, is_current);
CREATE INDEX idx_policy_signatures_user_current   ON public.policy_signatures(user_id, is_current);
