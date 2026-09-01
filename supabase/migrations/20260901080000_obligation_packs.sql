-- Admin Obligations pack tabs + required/optional flag.
-- Idempotent. Do NOT drop or truncate. Do NOT run against production from CI —
-- Dane reviews this in the PR, then pastes it into Lovable's SQL editor
-- (clear the editor first). See docs/SQL_HANDOFF.md.
--
-- App code works without this file: locked packs (Onboarding / Credentials /
-- Client) group existing company_obligations by title. Custom pack names and
-- is_required also persist in due_day_config until this SQL is applied.

-- ── Additive columns on existing obligations ──────────────────────────────
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS pack_key text;

ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS company_obligations_org_pack_key_idx
  ON public.company_obligations (organization_id, pack_key)
  WHERE pack_key IS NOT NULL;

-- ── Custom pack tabs (locked system packs stay in app code) ───────────────
CREATE TABLE IF NOT EXISTS public.obligation_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pack_key text NOT NULL,
  name text NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  assign_roles text[] NOT NULL DEFAULT '{}',
  assign_job_codes text[] NOT NULL DEFAULT '{}',
  assigned_to_groups uuid[] NOT NULL DEFAULT '{}',
  assigned_to_users uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pack_key)
);

CREATE INDEX IF NOT EXISTS obligation_packs_org_idx
  ON public.obligation_packs (organization_id, sort_order);

ALTER TABLE public.obligation_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obligation_packs_select_org_member" ON public.obligation_packs;
CREATE POLICY "obligation_packs_select_org_member"
  ON public.obligation_packs FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "obligation_packs_write_admin" ON public.obligation_packs;
CREATE POLICY "obligation_packs_write_admin"
  ON public.obligation_packs FOR ALL TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obligation_packs TO authenticated;
GRANT ALL ON public.obligation_packs TO service_role;
