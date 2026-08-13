-- Batch migration for PROMPT 16-28.
-- Safe to run once; every statement is additive (new table only — every
-- other prompt in this batch reuses existing tables: client_belongings,
-- client_documents, nectar_documents [owner_kind='company'],
-- client_progress_summaries, service_codes).

-- ── Prompts 21/22/23: UPI + USOR attestations ───────────────────────────────
-- One small table covers three distinct attestation flavors, distinguished
-- by `kind` + whether `client_id` / `period_label` are set:
--   'sei_employment_monthly'   — client_id + period_label (YYYY-MM), monthly
--   'sei_support_strategies'   — client_id set, period_label NULL, one-time per PCSP cycle
--   'usor_vendor'              — client_id NULL (org-level), period_label NULL, one-time
-- client_id uses the nil UUID (not NULL) for org-level rows (usor_vendor), and
-- period_label uses '' (not NULL) for one-time rows (sei_support_strategies,
-- usor_vendor) so a real composite UNIQUE constraint can back upserts —
-- Postgres treats NULL <> NULL, which would defeat ON CONFLICT dedup.
CREATE TABLE IF NOT EXISTS public.upi_attestations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  kind             text NOT NULL CHECK (kind IN ('sei_employment_monthly', 'sei_support_strategies', 'usor_vendor')),
  period_label     text NOT NULL DEFAULT '',
  attested_at      timestamptz NOT NULL DEFAULT now(),
  attested_by      uuid NOT NULL,
  attested_by_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind, client_id, period_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upi_attestations TO authenticated;
GRANT ALL ON public.upi_attestations TO service_role;

ALTER TABLE public.upi_attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read upi attestations"
  ON public.upi_attestations FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage upi attestations"
  ON public.upi_attestations FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_upi_attestations_org_kind
  ON public.upi_attestations (organization_id, kind);
