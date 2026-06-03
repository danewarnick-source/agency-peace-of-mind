-- Tier 0.1 security fix: prevent self-join / self-elevation on organization_members.
-- Replace the broad "admins manage members" ALL policy (which contained
-- `user_id = auth.uid()` in WITH CHECK, allowing any user to insert themselves
-- into any organization with any role) with per-operation, admin-scoped policies.
-- Legitimate flows are unaffected:
--   * Invitation acceptance goes through public.accept_invitation() (SECURITY DEFINER, bypasses RLS).
--   * Admin onboarding / bulk import / HIVE Exec edits use supabaseAdmin (bypasses RLS).
--   * New-user auto-membership uses handle_new_user() trigger (SECURITY DEFINER).
--   * Admin "toggle active" / "edit role" from the Employees page is preserved
--     by the new admin UPDATE policy below.

DROP POLICY IF EXISTS "admins manage members" ON public.organization_members;

-- SELECT: users continue to see their own row; admins of an org also see all
-- members of that org. (Existing "read own or org members" policy is kept.)
CREATE POLICY "admins read org members"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
  OR public.is_hive_executive(auth.uid())
);

-- INSERT: only an existing admin/super_admin of the SAME org may insert a
-- membership row. A user CANNOT insert themselves (user_id = auth.uid() is
-- no longer sufficient). Invitation acceptance bypasses RLS via SECURITY DEFINER.
CREATE POLICY "admins insert org members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

-- UPDATE: only an admin/super_admin of the org may update memberships
-- (role changes, active toggles). A member cannot self-elevate.
CREATE POLICY "admins update org members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);

-- DELETE: only an admin/super_admin of the org may remove memberships.
CREATE POLICY "admins delete org members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.is_super_admin(auth.uid())
);
