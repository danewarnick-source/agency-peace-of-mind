-- Additive org fact_* columns + obligation_applicability (Compliance revamp Step 5).
-- Idempotent. No DROP TABLE / DROP COLUMN.
-- Do NOT run against production from CI — Core Soft pastes this in Lovable
-- (clear the editor first). See docs/SQL_HANDOFF.md.

-- ── organizations operational facts (null = unanswered) ───────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_operates_ol_site boolean;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_uses_volunteers boolean;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_has_governing_board boolean;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_answers_updated_at timestamptz;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_answers_updated_by uuid;

-- ── per-org computed (or later overridden) applicability ──────────────────
CREATE TABLE IF NOT EXISTS public.obligation_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  obligation_key text NOT NULL,
  fact_key text NOT NULL,
  applies boolean NOT NULL,
  unanswered boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'computed',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, obligation_key)
);

ALTER TABLE public.obligation_applicability
  DROP CONSTRAINT IF EXISTS obligation_applicability_source_chk;
ALTER TABLE public.obligation_applicability
  ADD CONSTRAINT obligation_applicability_source_chk
  CHECK (source IN ('computed', 'override'));

CREATE INDEX IF NOT EXISTS obligation_applicability_org_idx
  ON public.obligation_applicability (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obligation_applicability TO authenticated;
GRANT ALL ON public.obligation_applicability TO service_role;

ALTER TABLE public.obligation_applicability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obligation_applicability_select_member ON public.obligation_applicability;
CREATE POLICY obligation_applicability_select_member
  ON public.obligation_applicability
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS obligation_applicability_write_admin ON public.obligation_applicability;
CREATE POLICY obligation_applicability_write_admin
  ON public.obligation_applicability
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
