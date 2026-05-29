DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'organization_members' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_members', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "read own or org members"
  ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins manage members"
  ON public.organization_members
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  );

UPDATE public.organization_members
SET role = 'super_admin', active = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'danewarnick@gmail.com');