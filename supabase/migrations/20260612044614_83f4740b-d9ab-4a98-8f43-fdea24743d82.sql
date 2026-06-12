
-- Per-client host home identity + host daily rate
CREATE TABLE public.hhs_host_home_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  hhp_name text,
  host_daily_rate numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hhs_host_home_settings TO authenticated;
GRANT ALL ON public.hhs_host_home_settings TO service_role;
ALTER TABLE public.hhs_host_home_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hhs_host_settings admins read"
  ON public.hhs_host_home_settings FOR SELECT TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "hhs_host_settings admins write"
  ON public.hhs_host_home_settings FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- Per-(client, month) Activities + Room & Board inputs
CREATE TABLE public.hhs_host_home_monthly (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  activities_amount numeric(12,2) NOT NULL DEFAULT 0,
  room_and_board_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hhs_host_home_monthly TO authenticated;
GRANT ALL ON public.hhs_host_home_monthly TO service_role;
ALTER TABLE public.hhs_host_home_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hhs_host_monthly admins read"
  ON public.hhs_host_home_monthly FOR SELECT TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "hhs_host_monthly admins write"
  ON public.hhs_host_home_monthly FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_hhs_host_settings_updated
  BEFORE UPDATE ON public.hhs_host_home_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hhs_host_monthly_updated
  BEFORE UPDATE ON public.hhs_host_home_monthly
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
