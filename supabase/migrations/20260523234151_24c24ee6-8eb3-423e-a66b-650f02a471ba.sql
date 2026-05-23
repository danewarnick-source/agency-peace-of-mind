
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  pcsp_goals_addressed text[] NOT NULL DEFAULT '{}'::text[],
  narrative text NOT NULL,
  signature_data_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_org ON public.daily_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user ON public.daily_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_client ON public.daily_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON public.daily_logs(log_date);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own daily logs"
  ON public.daily_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_org_member(organization_id, auth.uid()));

CREATE POLICY "users read own daily logs"
  ON public.daily_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "users update own daily logs"
  ON public.daily_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "managers delete daily logs"
  ON public.daily_logs FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
