-- CE settings (per organization)
CREATE TABLE public.ce_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_active_minutes int NOT NULL DEFAULT 60 CHECK (min_active_minutes BETWEEN 5 AND 240),
  annual_goal_hours int NOT NULL DEFAULT 12 CHECK (annual_goal_hours BETWEEN 1 AND 100),
  demo_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ce_settings TO authenticated;
GRANT ALL ON public.ce_settings TO service_role;
ALTER TABLE public.ce_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_settings_read ON public.ce_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY ce_settings_write ON public.ce_settings FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- CE modules (one per staff per period)
CREATE TABLE public.ce_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating','ready','in_progress','completed','failed')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_seconds int NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  current_step int NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  reflections jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_summary text,
  generated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, period)
);
CREATE INDEX idx_ce_modules_org_staff ON public.ce_modules(organization_id, staff_id);
CREATE INDEX idx_ce_modules_period ON public.ce_modules(period);
GRANT SELECT, INSERT, UPDATE ON public.ce_modules TO authenticated;
GRANT ALL ON public.ce_modules TO service_role;
ALTER TABLE public.ce_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_modules_self_read ON public.ce_modules FOR SELECT TO authenticated
  USING (staff_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid()));
CREATE POLICY ce_modules_self_insert ON public.ce_modules FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid() AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY ce_modules_self_update ON public.ce_modules FOR UPDATE TO authenticated
  USING (staff_id = auth.uid())
  WITH CHECK (staff_id = auth.uid());

-- CE ledger (immutable)
CREATE TABLE public.ce_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  module_id uuid REFERENCES public.ce_modules(id) ON DELETE SET NULL,
  ce_year_start date NOT NULL,
  title text NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0),
  active_minutes int NOT NULL CHECK (active_minutes >= 0),
  type text NOT NULL CHECK (type IN ('monthly','required','elective')),
  source text,
  completed_at timestamptz NOT NULL DEFAULT now(),
  signature_name text NOT NULL,
  attestation_text text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ce_ledger_org_staff_year ON public.ce_ledger(organization_id, staff_id, ce_year_start);
GRANT SELECT, INSERT ON public.ce_ledger TO authenticated;
GRANT ALL ON public.ce_ledger TO service_role;
ALTER TABLE public.ce_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_ledger_self_read ON public.ce_ledger FOR SELECT TO authenticated
  USING (staff_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid()));
CREATE POLICY ce_ledger_self_insert ON public.ce_ledger FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid() AND public.is_org_member(organization_id, auth.uid()));
-- No UPDATE or DELETE policies → immutable for staff and admins via PostgREST.

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.ce_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_ce_settings_updated_at BEFORE UPDATE ON public.ce_settings
  FOR EACH ROW EXECUTE FUNCTION public.ce_set_updated_at();
CREATE TRIGGER trg_ce_modules_updated_at BEFORE UPDATE ON public.ce_modules
  FOR EACH ROW EXECUTE FUNCTION public.ce_set_updated_at();