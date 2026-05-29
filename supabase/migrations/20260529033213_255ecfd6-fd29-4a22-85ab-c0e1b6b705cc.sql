-- Fix RLS broken by security scanner - restore organization_members read access
DROP POLICY IF EXISTS "users read own membership" ON public.organization_members;
DROP POLICY IF EXISTS "members_select_policy" ON public.organization_members;
DROP POLICY IF EXISTS "org members read own row" ON public.organization_members;

CREATE POLICY "members can read own row"
  ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins can read all org members"  
  ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members AS m2
      WHERE m2.user_id = auth.uid()
      AND m2.active = true
    )
  );