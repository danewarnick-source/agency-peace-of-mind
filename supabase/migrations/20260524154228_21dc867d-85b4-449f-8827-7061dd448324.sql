
-- Teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.provider_tenants(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_org ON public.teams(organization_id);
CREATE INDEX idx_teams_tenant ON public.teams(tenant_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins manage all teams"
  ON public.teams FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "org members read teams"
  ON public.teams FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org managers write teams"
  ON public.teams FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER teams_touch_updated BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add team_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_team ON public.profiles(team_id);

-- Add team_id to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_team ON public.clients(team_id);
