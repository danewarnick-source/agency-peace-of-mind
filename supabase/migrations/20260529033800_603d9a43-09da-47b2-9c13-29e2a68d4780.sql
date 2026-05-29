-- ================================================================
-- EMERGENCY RESTORE: Drop all security-scanner-added policies
-- and restore original working RLS state
-- ================================================================

DROP POLICY IF EXISTS "users read own membership" ON public.organization_members;
DROP POLICY IF EXISTS "users update own membership role" ON public.organization_members;
DROP POLICY IF EXISTS "members can read own row" ON public.organization_members;
DROP POLICY IF EXISTS "admins can read all org members" ON public.organization_members;
DROP POLICY IF EXISTS "org members read own row" ON public.organization_members;

DROP POLICY IF EXISTS "members read members" ON public.organization_members;
DROP POLICY IF EXISTS "admins manage members" ON public.organization_members;
DROP POLICY IF EXISTS "self insert member" ON public.organization_members;

CREATE POLICY "members read members" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "admins manage members" ON public.organization_members
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

CREATE POLICY "self insert member" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "members read org" ON public.organizations;
CREATE POLICY "members read org" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "members read clients" ON public.clients;
DROP POLICY IF EXISTS "org members read clients" ON public.clients;
CREATE POLICY "members read clients" ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "select own profile" ON public.profiles;
DROP POLICY IF EXISTS "admins read profiles" ON public.profiles;
CREATE POLICY "select own profile" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff read own timesheets" ON public.evv_timesheets;
DROP POLICY IF EXISTS "org members read timesheets" ON public.evv_timesheets;
CREATE POLICY "org members read timesheets" ON public.evv_timesheets
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "staff read own logs" ON public.daily_logs;
DROP POLICY IF EXISTS "org members read daily logs" ON public.daily_logs;
CREATE POLICY "org members read daily logs" ON public.daily_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "admins read org notifications" ON public.notifications;
CREATE POLICY "admins read org notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.has_org_role(organization_id, auth.uid(), 'admin')
      OR public.has_org_role(organization_id, auth.uid(), 'manager')
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.is_super_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user
    AND role = 'super_admin'
    AND active = true
  );
$$;

UPDATE public.organization_members
SET role = 'super_admin', active = true
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'danewarnick@gmail.com'
);
