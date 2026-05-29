-- Emergency fix: allow users to read and update their own membership row
-- without depending on is_super_admin (which has circular RLS dependency)

DROP POLICY IF EXISTS "users read own membership" ON public.organization_members;
CREATE POLICY "users read own membership"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own membership role" ON public.organization_members;
CREATE POLICY "users update own membership role"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());