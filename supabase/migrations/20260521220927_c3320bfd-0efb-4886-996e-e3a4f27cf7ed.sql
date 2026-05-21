
-- Enum for track types
DO $$ BEGIN
  CREATE TYPE public.track_type AS ENUM ('onboarding_30','certification_90','behavioral','abi_specialty','annual','custom');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- training_tracks
CREATE TABLE IF NOT EXISTS public.training_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  is_global boolean NOT NULL DEFAULT false,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  track_type public.track_type NOT NULL DEFAULT 'custom',
  due_within_days integer,
  recurrence_months integer,
  min_annual_hours integer,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

ALTER TABLE public.training_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read tracks" ON public.training_tracks
  FOR SELECT TO authenticated
  USING (is_global OR is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write tracks" ON public.training_tracks
  FOR ALL TO authenticated
  USING ((organization_id IS NOT NULL AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_super_admin(auth.uid()))
  WITH CHECK ((organization_id IS NOT NULL AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_super_admin(auth.uid()));

-- track_programs (link tracks to existing training_programs)
CREATE TABLE IF NOT EXISTS public.track_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL,
  program_id uuid NOT NULL,
  required boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, program_id)
);

ALTER TABLE public.track_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read track programs via track" ON public.track_programs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_tracks t WHERE t.id = track_programs.track_id
    AND (t.is_global OR is_org_member(t.organization_id, auth.uid()) OR is_super_admin(auth.uid()))));

CREATE POLICY "managers write track programs" ON public.track_programs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_tracks t WHERE t.id = track_programs.track_id
    AND (is_super_admin(auth.uid()) OR (t.organization_id IS NOT NULL AND is_org_admin_or_manager(t.organization_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_tracks t WHERE t.id = track_programs.track_id
    AND (is_super_admin(auth.uid()) OR (t.organization_id IS NOT NULL AND is_org_admin_or_manager(t.organization_id, auth.uid())))));

-- track_assignments
CREATE TABLE IF NOT EXISTS public.track_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  assigned_by uuid,
  status public.assignment_status NOT NULL DEFAULT 'not_started',
  progress integer NOT NULL DEFAULT 0,
  due_date date,
  expires_at timestamptz,
  completed_at timestamptz,
  recurs_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_id, user_id)
);

ALTER TABLE public.track_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own track assign" ON public.track_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers assign tracks" ON public.track_assignments
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "user/manager update track assign" ON public.track_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "managers delete track assign" ON public.track_assignments
  FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- certification_types
CREATE TABLE IF NOT EXISTS public.certification_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid,
  organization_id uuid,
  is_global boolean NOT NULL DEFAULT false,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  validity_months integer DEFAULT 12,
  requires_upload boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

ALTER TABLE public.certification_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read cert types" ON public.certification_types
  FOR SELECT TO authenticated
  USING (is_global OR is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write cert types" ON public.certification_types
  FOR ALL TO authenticated
  USING ((organization_id IS NOT NULL AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_super_admin(auth.uid()))
  WITH CHECK ((organization_id IS NOT NULL AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_super_admin(auth.uid()));

-- Extend external_certifications
ALTER TABLE public.external_certifications
  ADD COLUMN IF NOT EXISTS certification_type_id uuid,
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at timestamptz;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS training_tracks_touch ON public.training_tracks;
CREATE TRIGGER training_tracks_touch BEFORE UPDATE ON public.training_tracks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed global tracks (no org)
INSERT INTO public.training_tracks (is_global, name, slug, description, track_type, due_within_days, recurrence_months, min_annual_hours) VALUES
  (true, '30-Day Required Training', '30-day-required', 'Core compliance training required within first 30 days of employment.', 'onboarding_30', 30, NULL, NULL),
  (true, '90-Day Certification Requirements', '90-day-certifications', 'CPR, First Aid and Person-Centered Practices required within 90 days.', 'certification_90', 90, 24, NULL),
  (true, 'Behavioral Intervention Certifications', 'behavioral-interventions', 'External behavioral intervention certifications (SOAR, MANDT, PART, CPI/Safety Care).', 'behavioral', 90, 12, NULL),
  (true, 'ABI Specialty Training', 'abi-specialty', 'Acquired Brain Injury specialty training modules.', 'abi_specialty', 60, NULL, NULL),
  (true, 'Annual Continuing Education', 'annual-ce', 'Recurring annual training and continuing education hours.', 'annual', 365, 12, 12)
ON CONFLICT (slug) DO NOTHING;

-- Seed certification types
INSERT INTO public.certification_types (is_global, code, name, validity_months, track_id)
SELECT true, v.code, v.name, v.months, t.id
FROM (VALUES
  ('cpr','CPR Certification',24,'90-day-certifications'),
  ('first_aid','First Aid Certification',24,'90-day-certifications'),
  ('person_centered','Person-Centered Practices',24,'90-day-certifications'),
  ('soar','SOAR',12,'behavioral-interventions'),
  ('mandt','MANDT',12,'behavioral-interventions'),
  ('part','PART',12,'behavioral-interventions'),
  ('cpi_safety_care','CPI / Safety Care',12,'behavioral-interventions')
) AS v(code,name,months,track_slug)
LEFT JOIN public.training_tracks t ON t.slug = v.track_slug
ON CONFLICT (code) DO NOTHING;
