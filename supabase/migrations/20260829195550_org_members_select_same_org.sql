-- People directory: staff need to SELECT other membership rows in their own org.
-- Policy name already said that; USING was only user_id = auth.uid().
-- Admins still have "admins read org members". This restores same-org SELECT
-- for regular staff. Org-scoped via is_org_member; hive execs keep global read.

DROP POLICY IF EXISTS "read own or org members" ON public.organization_members;

CREATE POLICY "read own or org members"
  ON public.organization_members
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_member(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );
