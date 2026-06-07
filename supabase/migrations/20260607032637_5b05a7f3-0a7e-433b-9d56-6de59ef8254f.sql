
-- Org-level toggle for post-shift behavior questions
CREATE TABLE public.org_shift_behavior_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_shift_behavior_settings TO authenticated;
GRANT ALL ON public.org_shift_behavior_settings TO service_role;

ALTER TABLE public.org_shift_behavior_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their org behavior setting"
  ON public.org_shift_behavior_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admins manage their org behavior setting"
  ON public.org_shift_behavior_settings FOR ALL TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_org_shift_behavior_settings_updated_at
  BEFORE UPDATE ON public.org_shift_behavior_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-shift behavior observations (staff observations at clock-out)
CREATE TABLE public.shift_behavior_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.evv_timesheets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Q1 gate
  behaviors_observed BOOLEAN NOT NULL,
  -- Q2 target behavior selections + per-item counts (e.g., {"Aggression":"2-3","Other":"1"})
  target_behaviors JSONB NOT NULL DEFAULT '[]'::jsonb,
  behavior_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Q3-Q5 objective narrative
  objective_description TEXT,
  antecedent_context TEXT,
  intervention_response TEXT,
  -- Q6
  reportable_incident BOOLEAN NOT NULL DEFAULT false,
  -- Q7
  positives TEXT,
  -- Q8 fewer | same | more | na
  trend_vs_recent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shift_behavior_one_per_shift UNIQUE (shift_id)
);

CREATE INDEX idx_shift_behavior_obs_org_client ON public.shift_behavior_observations(organization_id, client_id, observed_at DESC);
CREATE INDEX idx_shift_behavior_obs_staff ON public.shift_behavior_observations(staff_id, observed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_behavior_observations TO authenticated;
GRANT ALL ON public.shift_behavior_observations TO service_role;

ALTER TABLE public.shift_behavior_observations ENABLE ROW LEVEL SECURITY;

-- Staff insert their own observation rows for their shift
CREATE POLICY "Staff insert own shift behavior obs"
  ON public.shift_behavior_observations FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

-- Staff can read their own; admins/managers read all in org
CREATE POLICY "Staff read own; admins read org shift behavior obs"
  ON public.shift_behavior_observations FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  );

-- Admins/managers update (for corrections); staff can update their own within same shift
CREATE POLICY "Staff update own; admins update org shift behavior obs"
  ON public.shift_behavior_observations FOR UPDATE TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    staff_id = auth.uid()
    OR public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_shift_behavior_obs_updated_at
  BEFORE UPDATE ON public.shift_behavior_observations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
