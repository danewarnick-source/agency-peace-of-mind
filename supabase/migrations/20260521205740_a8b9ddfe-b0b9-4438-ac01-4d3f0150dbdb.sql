CREATE OR REPLACE FUNCTION public.is_super_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user AND role = 'super_admin'::app_role AND active
  );
$$;

-- Super admins can read everything platform-wide
CREATE POLICY "super admins read all orgs"
ON public.organizations FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins read all members"
ON public.organization_members FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins read all assignments"
ON public.course_assignments FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "super admins read all certifications"
ON public.certifications FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));
