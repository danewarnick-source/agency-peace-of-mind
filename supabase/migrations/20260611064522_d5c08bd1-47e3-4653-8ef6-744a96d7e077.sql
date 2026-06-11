
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS service_code text,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS is_awake_overnight boolean,
  ADD COLUMN IF NOT EXISTS callout_reason text,
  ADD COLUMN IF NOT EXISTS created_from text,
  ADD COLUMN IF NOT EXISTS parent_shift_id uuid REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS override_reason text;

ALTER TABLE public.scheduled_shifts DROP CONSTRAINT IF EXISTS scheduled_shifts_status_check;
UPDATE public.scheduled_shifts SET status = 'accepted' WHERE status = 'pending' AND published = true;
UPDATE public.scheduled_shifts SET status = 'draft' WHERE status = 'pending' AND published = false;
ALTER TABLE public.scheduled_shifts
  ADD CONSTRAINT scheduled_shifts_status_check
  CHECK (status IN ('draft','published','accepted','declined','open','cancelled'));

ALTER TABLE public.scheduled_shifts DROP CONSTRAINT IF EXISTS scheduled_shifts_created_from_check;
ALTER TABLE public.scheduled_shifts
  ADD CONSTRAINT scheduled_shifts_created_from_check
  CHECK (created_from IS NULL OR created_from IN ('manual','template','nectar','import','rotation'));

CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_location ON public.scheduled_shifts(location_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_parent ON public.scheduled_shifts(parent_shift_id);

ALTER TABLE public.shift_templates ADD COLUMN IF NOT EXISTS color text;

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('residential','host_home','day_site','community')),
  address text,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  legacy_home_designation_id uuid REFERENCES public.home_designations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read locations" ON public.locations
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "admins write locations" ON public.locations
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
DROP TRIGGER IF EXISTS locations_touch ON public.locations;
CREATE TRIGGER locations_touch BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.locations (organization_id, name, type, legacy_home_designation_id, sort)
SELECT hd.organization_id, hd.label, 'residential', hd.id, hd.sort
FROM public.home_designations hd
WHERE hd.active = true
ON CONFLICT (organization_id, name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.location_coverage_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  day_of_week smallint CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  required_staff_count integer NOT NULL DEFAULT 1 CHECK (required_staff_count >= 0),
  awake_required boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_coverage_requirements TO authenticated;
GRANT ALL ON public.location_coverage_requirements TO service_role;
ALTER TABLE public.location_coverage_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read coverage reqs" ON public.location_coverage_requirements
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "admins write coverage reqs" ON public.location_coverage_requirements
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
DROP TRIGGER IF EXISTS coverage_reqs_touch ON public.location_coverage_requirements;
CREATE TRIGGER coverage_reqs_touch BEFORE UPDATE ON public.location_coverage_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_coverage_reqs_loc ON public.location_coverage_requirements(location_id);

CREATE TABLE IF NOT EXISTS public.client_weekly_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  target_hours_per_week numeric(6,2) NOT NULL CHECK (target_hours_per_week >= 0),
  source text NOT NULL DEFAULT 'worksheet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, service_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_weekly_targets TO authenticated;
GRANT ALL ON public.client_weekly_targets TO service_role;
ALTER TABLE public.client_weekly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read weekly targets" ON public.client_weekly_targets
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "admins write weekly targets" ON public.client_weekly_targets
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
DROP TRIGGER IF EXISTS weekly_targets_touch ON public.client_weekly_targets;
CREATE TRIGGER weekly_targets_touch BEFORE UPDATE ON public.client_weekly_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scheduled_shifts DROP CONSTRAINT IF EXISTS scheduled_shifts_location_id_fkey;
ALTER TABLE public.scheduled_shifts
  ADD CONSTRAINT scheduled_shifts_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
