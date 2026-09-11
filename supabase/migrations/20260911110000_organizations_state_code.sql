-- Additive organizations.state_code (Compliance revamp Step 8).
-- Idempotent. No DROP. No RLS change (column on existing org-scoped table).
-- Do NOT run against production from CI — Core Soft pastes this in Lovable
-- (clear the editor first). See docs/SQL_HANDOFF.md.
--
-- The column already exists on some environments (June 2026 platform_states
-- migration). ADD COLUMN IF NOT EXISTS is a no-op when live.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS state_code text;

CREATE INDEX IF NOT EXISTS organizations_state_code_idx
  ON public.organizations (state_code);
