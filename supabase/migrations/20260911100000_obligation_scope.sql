-- Additive compliance scope columns (Compliance revamp Step 3).
-- Idempotent. Additive only. Do NOT run against production from CI — Core Soft
-- pastes this in Lovable (clear the editor first). See docs/SQL_HANDOFF.md.
--
-- Live check (2026-09-11): profiles and organization_members have no
-- scope_group_id; staff_group_members has no is_lead. Brief column is
-- profiles.scope_group_id (nullable). Existing RLS on both tables covers
-- the new columns — no USING(true) on org/PHI data.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scope_group_id uuid
    REFERENCES public.staff_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_scope_group_id
  ON public.profiles (scope_group_id);

ALTER TABLE public.staff_group_members
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_staff_group_members_lead
  ON public.staff_group_members (group_id)
  WHERE is_lead = true;
