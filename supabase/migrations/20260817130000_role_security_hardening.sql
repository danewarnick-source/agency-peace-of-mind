-- Role security audit hardening.
--
-- Fix 1.1: "self insert member" allowed an authenticated user to insert
-- themselves into an org with ANY role (including super_admin). Constrain
-- self-inserts to the lowest-privilege role only.
DROP POLICY IF EXISTS "self insert member" ON public.organization_members;
CREATE POLICY "self insert member" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'employee'
  );

-- Fix 1.2: invitations.role had no column-level constraint, so an admin
-- (who can only insert invites for their own org) could still craft a
-- direct insert with role = 'super_admin'. Elevation beyond admin/employee
-- must go through setMemberGrants after the person joins.
ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'employee'));

-- Fix 1.4: audit trail for every role change.
CREATE TABLE IF NOT EXISTS public.role_change_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  changed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_name text NOT NULL,
  previous_role text NOT NULL,
  new_role text NOT NULL,
  change_method text NOT NULL, -- 'setMemberGrants' | 'invitation' | 'createEmployee' | 'deactivation' | 'unauthorized_attempt'
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_change_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read role audit log" ON public.role_change_audit_log;
CREATE POLICY "admins read role audit log"
  ON public.role_change_audit_log FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid())
      OR public.is_super_admin(auth.uid()));

-- All inserts go through SECURITY DEFINER functions / the service role
-- (supabaseAdmin in server functions) only — never a direct user write.
DROP POLICY IF EXISTS "system inserts role audit log" ON public.role_change_audit_log;
CREATE POLICY "system inserts role audit log"
  ON public.role_change_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

-- Fix 1.5: log the deactivation moment so it shows up in the same audit
-- trail as every other role change. Session invalidation itself (signOut)
-- happens in the app layer right after this call, via the Admin Auth API.
-- _changed_by_user_id is passed explicitly rather than relying on auth.uid()
-- because this is called from the archiveEntity server function via the
-- service-role client, where auth.uid() resolves to NULL.
CREATE OR REPLACE FUNCTION public.flag_member_deactivated(
  _org_id uuid,
  _user_id uuid,
  _changed_by_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed_by uuid := COALESCE(_changed_by_user_id, auth.uid());
BEGIN
  INSERT INTO public.role_change_audit_log (
    organization_id, changed_by_user_id, changed_by_name,
    target_user_id, target_user_name,
    previous_role, new_role, change_method
  )
  SELECT
    _org_id,
    v_changed_by,
    COALESCE((SELECT full_name FROM public.profiles WHERE id = v_changed_by), 'system'),
    _user_id,
    COALESCE((SELECT full_name FROM public.profiles WHERE id = _user_id), 'unknown'),
    om.role,
    'deactivated',
    'deactivation'
  FROM public.organization_members om
  WHERE om.organization_id = _org_id AND om.user_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_member_deactivated(uuid, uuid, uuid) TO authenticated;

-- Fix 1.3 + Fix 4.3: accept_invitation defense-in-depth role guard, and
-- auto-revoke any other pending invitation for the same email+org once one
-- is accepted (prevents a stray second invite being accepted later with a
-- role that may since have changed). Body otherwise unchanged from the
-- 20260814010000_all_staff_auto_group.sql version.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_email text;
  v_member_id uuid;
  v_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (auth.jwt() ->> 'email') INTO v_email;

  SELECT * INTO v_inv FROM public.invitations WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation already used'; END IF;
  IF v_inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;
  IF lower(v_inv.email) <> lower(coalesce(v_email, '')) THEN
    RAISE EXCEPTION 'Invitation email does not match your account';
  END IF;

  IF v_inv.role NOT IN ('admin', 'employee') THEN
    RAISE EXCEPTION 'Invalid invitation role: %', v_inv.role;
  END IF;

  -- Upsert membership
  INSERT INTO public.organization_members (organization_id, user_id, role, active)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, active = true
  RETURNING id INTO v_member_id;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    WHERE id = v_inv.id;

  -- Revoke any other still-pending invite for the same email+org so it
  -- can't be accepted later.
  UPDATE public.invitations
    SET status = 'revoked'
    WHERE organization_id = v_inv.organization_id
      AND lower(email) = lower(v_email)
      AND status = 'pending'
      AND id <> v_inv.id;

  -- Ensure the "All Staff" auto-group exists for this org, then add this
  -- new/reactivated staffer to it (idempotent).
  SELECT id INTO v_group_id
    FROM public.staff_groups
    WHERE organization_id = v_inv.organization_id AND name = 'All Staff'
    LIMIT 1;
  IF v_group_id IS NULL THEN
    INSERT INTO public.staff_groups (organization_id, name, description, color)
    VALUES (
      v_inv.organization_id,
      'All Staff',
      'System-managed group — every staff member in this organization',
      '#6B7280'
    )
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO public.staff_group_members (group_id, staff_id)
  VALUES (v_group_id, auth.uid())
  ON CONFLICT (group_id, staff_id) DO NOTHING;

  RETURN v_inv.organization_id;
END;
$$;
