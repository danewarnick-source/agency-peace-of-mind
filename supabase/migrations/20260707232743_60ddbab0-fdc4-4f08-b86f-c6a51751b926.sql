
-- Per-client meal support activation (mirrors client_chore_support)
CREATE TABLE public.client_meal_support (
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meal_support TO authenticated;
GRANT ALL ON public.client_meal_support TO service_role;

ALTER TABLE public.client_meal_support ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_meal_support_read" ON public.client_meal_support
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "client_meal_support_write" ON public.client_meal_support
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_client_meal_support_updated
  BEFORE UPDATE ON public.client_meal_support
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_client_meal_support_org ON public.client_meal_support(organization_id);
CREATE INDEX idx_client_meal_support_client ON public.client_meal_support(client_id);

-- Backfill: clients with the legacy needs_shopping_help toggle ON become
-- meal-support-active with reason='manual' (data preserved, folded into activation).
INSERT INTO public.client_meal_support (client_id, organization_id, status, reason, goal_note, activated_at)
SELECT c.id, c.organization_id, 'active', 'manual',
       'Migrated from legacy "needs shopping help" toggle',
       now()
FROM public.clients c
WHERE c.needs_shopping_help = true
  AND c.organization_id IS NOT NULL
ON CONFLICT (client_id) DO NOTHING;
