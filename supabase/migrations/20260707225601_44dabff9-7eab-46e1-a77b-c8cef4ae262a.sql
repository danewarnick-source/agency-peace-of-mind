
-- 1) Per-client chore support activation
CREATE TABLE public.client_chore_support (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'off' CHECK (status IN ('off','active')),
  reason text CHECK (reason IN ('pcsp_goal','intake_need','manual')),
  goal_note text,
  activated_by uuid REFERENCES auth.users(id),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_chore_support TO authenticated;
GRANT ALL ON public.client_chore_support TO service_role;

ALTER TABLE public.client_chore_support ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_chore_support_read" ON public.client_chore_support
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "client_chore_support_write" ON public.client_chore_support
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_client_chore_support_updated
  BEFORE UPDATE ON public.client_chore_support
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_client_chore_support_org ON public.client_chore_support(organization_id);
CREATE INDEX idx_client_chore_support_client ON public.client_chore_support(client_id);

-- 2) Outcome + optional client link on chore_completions
ALTER TABLE public.chore_completions
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'completed'
    CHECK (outcome IN ('completed','completed_with_support','offered_declined','not_addressed')),
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

-- Rebuild uniqueness so per-client outcomes are allowed for daily items
ALTER TABLE public.chore_completions DROP CONSTRAINT IF EXISTS chore_completions_space_id_source_source_id_completion_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS chore_completions_unique_per_client
  ON public.chore_completions(space_id, source, source_id, completion_date, COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_chore_completions_client ON public.chore_completions(client_id, completion_date);
