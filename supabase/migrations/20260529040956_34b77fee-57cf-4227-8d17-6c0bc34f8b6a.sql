
-- Step 1: Wipe every policy on organization_members
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

-- Step 2: Re-grant data API access (in case prior migrations dropped them)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;

-- Step 3: Ensure security-definer role check functions exist
CREATE OR REPLACE FUNCTION public.is_super_admin(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user AND role = 'super_admin' AND active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND role = _role AND active = true
  );
$$;

-- Step 4: Make sure RLS is on
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Step 5: Recreate minimal policies
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

-- Step 6: Force danewarnick@gmail.com back to super_admin
UPDATE public.organization_members
SET role = 'super_admin', active = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'danewarnick@gmail.com');
