
-- Training Programs (group of courses)
CREATE TABLE public.training_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  category text,
  cover_url text,
  is_global boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  annual_renewal boolean NOT NULL DEFAULT false,
  validity_months integer DEFAULT 12,
  estimated_minutes integer DEFAULT 60,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read programs" ON public.training_programs
  FOR SELECT TO authenticated
  USING (is_global OR is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write programs" ON public.training_programs
  FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (organization_id IS NOT NULL AND is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "super admins write programs" ON public.training_programs
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Program <-> Course links (modules in a program)
CREATE TABLE public.program_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  unlock_after uuid REFERENCES public.program_courses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, course_id)
);
ALTER TABLE public.program_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read program courses via program" ON public.program_courses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_courses.program_id
    AND (p.is_global OR is_org_member(p.organization_id, auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "managers write program courses" ON public.program_courses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_courses.program_id
    AND (is_super_admin(auth.uid()) OR (p.organization_id IS NOT NULL AND is_org_admin_or_manager(p.organization_id, auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_programs p WHERE p.id = program_courses.program_id
    AND (is_super_admin(auth.uid()) OR (p.organization_id IS NOT NULL AND is_org_admin_or_manager(p.organization_id, auth.uid())))));

-- Program Assignments (assign a program to a user)
CREATE TABLE public.program_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  assigned_by uuid,
  status assignment_status NOT NULL DEFAULT 'not_started',
  progress integer NOT NULL DEFAULT 0,
  due_date date,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, user_id)
);
ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own program assignment" ON public.program_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers assign programs" ON public.program_assignments
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY "user updates own program assignment" ON public.program_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete program assignments" ON public.program_assignments
  FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- Program acknowledgements (sign-offs per course in a program)
CREATE TABLE public.program_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_assignment_id uuid NOT NULL REFERENCES public.program_assignments(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_assignment_id, course_id)
);
ALTER TABLE public.program_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user own acks" ON public.program_acknowledgements
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "managers read acks" ON public.program_acknowledgements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.program_assignments pa WHERE pa.id = program_acknowledgements.program_assignment_id
    AND is_org_admin_or_manager(pa.organization_id, auth.uid())));

-- External Certifications (CPR, SOAR, MANDT, PART, CPI, etc.)
CREATE TYPE external_cert_status AS ENUM ('pending','approved','rejected','expired');

CREATE TABLE public.external_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  cert_type text NOT NULL,
  cert_name text,
  issuer text,
  issued_date date,
  expires_at date,
  file_url text,
  status external_cert_status NOT NULL DEFAULT 'pending',
  reviewer_id uuid,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.external_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own ext certs" ON public.external_certifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "user uploads own ext certs" ON public.external_certifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "user updates own pending ext certs" ON public.external_certifications
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "user deletes own pending ext certs" ON public.external_certifications
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR is_org_admin_or_manager(organization_id, auth.uid()));

-- Storage bucket for certificates (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users read own cert files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users upload own cert files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users update own cert files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own cert files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'certificates' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "managers read all cert files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'certificates' AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid() AND om.active AND om.role IN ('admin','manager','super_admin')
  ));

-- Seed DSPD Core Compliance Training as a global program
INSERT INTO public.training_programs (name, slug, description, category, is_global, annual_renewal, validity_months, estimated_minutes)
VALUES ('DSPD Core Compliance Training', 'dspd-core-compliance',
  'Required annual compliance training for DSPD direct support professionals. Complete all modules to earn certification valid for 12 months.',
  'Compliance', true, true, 12, 180);
