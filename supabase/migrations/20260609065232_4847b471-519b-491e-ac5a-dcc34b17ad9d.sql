
-- 1) Catalog table
CREATE TABLE IF NOT EXISTS public.service_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT,
  category TEXT NOT NULL,
  scheduling_behavior TEXT NOT NULL CHECK (scheduling_behavior IN (
    'staffed_residential','host_family_residential','supported_living',
    'day_employment','respite','in_home','behavior','billing_only'
  )),
  requires_schedule BOOLEAN NOT NULL DEFAULT true,
  requires_evv BOOLEAN NOT NULL DEFAULT false,
  is_living_arrangement BOOLEAN NOT NULL DEFAULT false,
  carve_out BOOLEAN NOT NULL DEFAULT false,
  unit TEXT NOT NULL CHECK (unit IN ('day','quarter_hour','session','monthly','one_time')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_codes TO authenticated;
GRANT ALL ON public.service_codes TO service_role;

ALTER TABLE public.service_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read service catalog"
  ON public.service_codes FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins manage service catalog"
  ON public.service_codes FOR ALL TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER trg_service_codes_updated_at
  BEFORE UPDATE ON public.service_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Seed function with the 19 standard codes
CREATE OR REPLACE FUNCTION public.seed_standard_service_codes(_org UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.service_codes
    (organization_id, code, name, category, scheduling_behavior,
     requires_schedule, requires_evv, is_living_arrangement, carve_out, unit)
  VALUES
    (_org,'RHS','Residential Habilitation (Staffed)','Residential','staffed_residential', true, false, true,  false,'day'),
    (_org,'HHS','Host Home Services','Residential','host_family_residential',           false,false,true,  false,'day'),
    (_org,'PPS','Professional Parent Services','Residential','host_family_residential', false,false,true,  false,'day'),
    (_org,'SLH','Supported Living (Hourly)','Supported Living','supported_living',      true, true, true,  false,'quarter_hour'),
    (_org,'SLN','Supported Living (Night)','Supported Living','supported_living',       true, true, true,  false,'quarter_hour'),
    (_org,'DSG','Day Supports - Group','Day Supports','day_employment',                 true, false,false, true, 'day'),
    (_org,'DSI','Day Supports - Individual','Day Supports','day_employment',            true, false,false, true, 'quarter_hour'),
    (_org,'SEI','Supported Employment - Individual','Supported Employment','day_employment', true, false,false, true,'quarter_hour'),
    (_org,'ELS','Extended Living Supports','Residential','day_employment',       true, false,false, false,'quarter_hour'),
    (_org,'RP2','Respite - Facility (no R&B)','Respite','respite',                       true, true, false, false,'session'),
    (_org,'RP3','Respite - Exceptional (no R&B)','Respite','respite',                    true, true, false, false,'session'),
    (_org,'RP4','Respite - Daily/Overnight (R&B)','Respite','respite',                   true, false,false, false,'day'),
    (_org,'RP5','Respite - Overnight Exceptional (R&B)','Respite','respite',             true, false,false, false,'day'),
    (_org,'CHA','Chore Services','In Home','in_home',                                    true, true, false, false,'quarter_hour'),
    (_org,'COM','Companion Services','In Home','in_home',                                true, true, false, false,'quarter_hour'),
    (_org,'HSQ','Homemaker Services','In Home','in_home',                                true, true, false, false,'quarter_hour'),
    (_org,'BC1','Behavior Consultation Tier 1','Behavior','behavior',                    true, false,false, false,'session'),
    (_org,'BC2','Behavior Consultation Tier 2','Behavior','behavior',                    true, false,false, false,'session'),
    (_org,'BC3','Behavior Consultation Tier 3','Behavior','behavior',                    true, false,false, false,'session'),
    (_org,'PBA','Personal Budget Assistance','Budget Assistance','billing_only',         false,false,false, false,'monthly'),
    (_org,'MTP','Medical Transportation','Transportation','billing_only',                false,false,false, false,'quarter_hour')
  ON CONFLICT (organization_id, code) DO NOTHING;
END;
$$;

-- 3) Backfill all existing organizations
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_standard_service_codes(r.id);
  END LOOP;
END $$;

-- 4) Auto-seed for new organizations
CREATE OR REPLACE FUNCTION public.seed_service_codes_on_org_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_standard_service_codes(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_service_codes_on_org_create ON public.organizations;
CREATE TRIGGER trg_seed_service_codes_on_org_create
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_service_codes_on_org_create();
