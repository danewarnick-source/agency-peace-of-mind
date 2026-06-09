
-- 1. Extend provider_authorized_codes (reuse, don't duplicate)
ALTER TABLE public.provider_authorized_codes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'discrete' CHECK (kind IN ('continuous','discrete')),
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'hour' CHECK (unit IN ('day','hour','unit15')),
  ADD COLUMN IF NOT EXISTS carve_out boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort integer NOT NULL DEFAULT 100;

-- Seed standard codes per org that already has any codes (idempotent)
INSERT INTO public.provider_authorized_codes (organization_id, code, label, status, source, kind, unit, carve_out, sort)
SELECT o.id, v.code, v.label, 'active', 'manual', v.kind, v.unit, v.carve_out, v.sort
FROM public.organizations o
CROSS JOIN (VALUES
  ('RHS','Residential Habilitation Support','continuous','day', false, 10),
  ('DSI','Day Support Individual',           'discrete',  'hour', true, 20),
  ('SEI','Supported Employment Individual',  'discrete',  'hour', true, 30),
  ('ELS','Extended Living Supports',         'discrete',  'hour', true, 40),
  ('DSG','Day Support Group',                'discrete',  'hour', true, 50)
) AS v(code,label,kind,unit,carve_out,sort)
ON CONFLICT (organization_id, code) DO NOTHING;

-- 2. Optional code link on shifts (additive)
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS code_id uuid REFERENCES public.provider_authorized_codes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_code ON public.scheduled_shifts(code_id);

-- 3. home_designations
CREATE TABLE public.home_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_designations TO authenticated;
GRANT ALL ON public.home_designations TO service_role;
ALTER TABLE public.home_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read home_designations" ON public.home_designations FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "admins write home_designations" ON public.home_designations FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE TRIGGER home_designations_touch BEFORE UPDATE ON public.home_designations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO public.home_designations (organization_id, label, sort)
SELECT o.id, v.label, v.sort
FROM public.organizations o
CROSS JOIN (VALUES ('House Manager',10),('Lead',20),('Supervisor',30),('DSP',40)) AS v(label,sort)
ON CONFLICT (organization_id, label) DO NOTHING;

-- 4. home_staff_designations (team_id = home, staff_id = profiles.id)
CREATE TABLE public.home_staff_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  designation_id uuid NOT NULL REFERENCES public.home_designations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, staff_id)
);
CREATE INDEX idx_hsd_team ON public.home_staff_designations(team_id);
CREATE INDEX idx_hsd_staff ON public.home_staff_designations(staff_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_staff_designations TO authenticated;
GRANT ALL ON public.home_staff_designations TO service_role;
ALTER TABLE public.home_staff_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read hsd" ON public.home_staff_designations FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "admins write hsd" ON public.home_staff_designations FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE TRIGGER hsd_touch BEFORE UPDATE ON public.home_staff_designations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 5. shift_templates (team_id NULL = org default; per-home overrides allowed)
CREATE TABLE public.shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shift_templates_org ON public.shift_templates(organization_id);
CREATE INDEX idx_shift_templates_team ON public.shift_templates(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_templates TO authenticated;
GRANT ALL ON public.shift_templates TO service_role;
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read shift_templates" ON public.shift_templates FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "admins write shift_templates" ON public.shift_templates FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE TRIGGER shift_templates_touch BEFORE UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO public.shift_templates (organization_id, team_id, name, start_time, end_time, sort)
SELECT o.id, NULL, v.name, v.start_time::time, v.end_time::time, v.sort
FROM public.organizations o
CROSS JOIN (VALUES
  ('Morning',  '07:00','15:00',10),
  ('Swing',    '15:00','23:00',20),
  ('Overnight','23:00','07:00',30)
) AS v(name,start_time,end_time,sort);

-- 6. client_ratios
CREATE TABLE public.client_ratios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  setting text NOT NULL CHECK (setting IN ('residential','day_program','overnight_awake','overnight_asleep')),
  ratio_staff integer NOT NULL CHECK (ratio_staff > 0),
  ratio_clients integer NOT NULL CHECK (ratio_clients > 0),
  effective_start date NOT NULL DEFAULT CURRENT_DATE,
  effective_end date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_ratios_client ON public.client_ratios(client_id);
CREATE INDEX idx_client_ratios_org ON public.client_ratios(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ratios TO authenticated;
GRANT ALL ON public.client_ratios TO service_role;
ALTER TABLE public.client_ratios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read client_ratios" ON public.client_ratios FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "admins write client_ratios" ON public.client_ratios FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid())); 
CREATE TRIGGER client_ratios_touch BEFORE UPDATE ON public.client_ratios
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
