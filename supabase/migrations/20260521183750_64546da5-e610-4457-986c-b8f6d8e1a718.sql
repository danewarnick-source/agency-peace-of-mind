
-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee');
CREATE TYPE public.assignment_status AS ENUM ('not_started', 'in_progress', 'completed', 'overdue');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'revoked');

-- =====================================================
-- ORGANIZATIONS
-- =====================================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  job_title TEXT,
  manager_id UUID REFERENCES public.organization_members(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);

-- =====================================================
-- SECURITY DEFINER helpers (avoid RLS recursion)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org AND user_id = _user AND active);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _user UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org AND user_id = _user AND role = _role AND active);
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_manager(_org UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org AND user_id = _user AND role IN ('admin','manager') AND active);
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids(_user UUID)
RETURNS SETOF UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user AND active;
$$;

-- =====================================================
-- ORG RLS
-- =====================================================
CREATE POLICY "members read org" ON public.organizations FOR SELECT
  TO authenticated USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "admins update org" ON public.organizations FOR UPDATE
  TO authenticated USING (public.has_org_role(id, auth.uid(), 'admin'));
CREATE POLICY "admins delete org" ON public.organizations FOR DELETE
  TO authenticated USING (public.has_org_role(id, auth.uid(), 'admin'));
CREATE POLICY "auth create org" ON public.organizations FOR INSERT
  TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "members read members" ON public.organization_members FOR SELECT
  TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "admins manage members" ON public.organization_members FOR ALL
  TO authenticated USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));
CREATE POLICY "self insert member" ON public.organization_members FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- =====================================================
-- INVITATIONS
-- =====================================================
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days')
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage invites" ON public.invitations FOR ALL
  TO authenticated USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));
CREATE POLICY "invitee read own" ON public.invitations FOR SELECT
  TO authenticated USING (email = auth.jwt()->>'email');

-- =====================================================
-- COURSES + MODULES
-- =====================================================
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  cover_url TEXT,
  duration_minutes INTEGER DEFAULT 30,
  certificate_validity_months INTEGER DEFAULT 12,
  is_published BOOLEAN NOT NULL DEFAULT true,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_courses_org ON public.courses(organization_id);

CREATE POLICY "members read courses" ON public.courses FOR SELECT
  TO authenticated USING (is_global OR public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers write courses" ON public.courses FOR ALL
  TO authenticated USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  video_url TEXT,
  pdf_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  quiz JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_modules_course ON public.course_modules(course_id);

CREATE POLICY "read modules via course" ON public.course_modules FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id
      AND (c.is_global OR public.is_org_member(c.organization_id, auth.uid())))
  );
CREATE POLICY "managers write modules" ON public.course_modules FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id
      AND public.is_org_admin_or_manager(c.organization_id, auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id
      AND public.is_org_admin_or_manager(c.organization_id, auth.uid()))
  );

-- =====================================================
-- ASSIGNMENTS + PROGRESS
-- =====================================================
CREATE TABLE public.course_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assigned_by UUID,
  due_date DATE,
  status public.assignment_status NOT NULL DEFAULT 'not_started',
  progress INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_assign_user ON public.course_assignments(user_id);
CREATE INDEX idx_assign_org ON public.course_assignments(organization_id);

CREATE POLICY "user reads own" ON public.course_assignments FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "user updates own progress" ON public.course_assignments FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers assign" ON public.course_assignments FOR INSERT
  TO authenticated WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete assign" ON public.course_assignments FOR DELETE
  TO authenticated USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TABLE public.module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.course_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  quiz_score INTEGER,
  completed_at TIMESTAMPTZ,
  UNIQUE (module_id, user_id)
);
ALTER TABLE public.module_progress ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_mp_user ON public.module_progress(user_id);

CREATE POLICY "user reads own progress" ON public.module_progress FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.course_assignments a
      WHERE a.id = assignment_id AND public.is_org_admin_or_manager(a.organization_id, auth.uid())
    )
  );
CREATE POLICY "user writes own progress" ON public.module_progress FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =====================================================
-- CERTIFICATIONS
-- =====================================================
CREATE TABLE public.certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  verification_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  recipient_name TEXT,
  course_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cert_user ON public.certifications(user_id);
CREATE INDEX idx_cert_org ON public.certifications(organization_id);

CREATE POLICY "public verify cert" ON public.certifications FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "system issues cert" ON public.certifications FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_org_admin_or_manager(organization_id, auth.uid()));

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Auto-create org on signup; replace existing handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, agency_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'agency_name')
  ON CONFLICT (id) DO NOTHING;

  org_name := COALESCE(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 1) || '''s workspace');

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (org_name, lower(regexp_replace(org_name || '-' || substr(NEW.id::text, 1, 6), '[^a-z0-9]+', '-', 'g')), NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-issue certificate when assignment completes
CREATE OR REPLACE FUNCTION public.issue_certificate_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course RECORD;
  v_user_name TEXT;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    SELECT title, certificate_validity_months INTO v_course FROM public.courses WHERE id = NEW.course_id;
    SELECT COALESCE(full_name, email) INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.certifications (user_id, course_id, organization_id, recipient_name, course_title, expires_at)
    VALUES (NEW.user_id, NEW.course_id, NEW.organization_id, v_user_name, v_course.title,
            CASE WHEN v_course.certificate_validity_months IS NOT NULL THEN now() + (v_course.certificate_validity_months || ' months')::interval ELSE NULL END)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_cert ON public.course_assignments;
CREATE TRIGGER trg_issue_cert
  AFTER UPDATE ON public.course_assignments
  FOR EACH ROW EXECUTE FUNCTION public.issue_certificate_on_completion();
