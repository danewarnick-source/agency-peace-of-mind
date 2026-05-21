
-- Customizable per-organization role permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  permission text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read role permissions"
ON public.role_permissions FOR SELECT TO authenticated
USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins write role permissions"
ON public.role_permissions FOR ALL TO authenticated
USING (has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))
WITH CHECK (has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()));

-- Track invitation acceptance + prevent duplicates
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS invitations_unique_pending
  ON public.invitations (organization_id, lower(email))
  WHERE status = 'pending';

-- Secure accept-invitation RPC. Runs as definer; matches by email of the
-- authenticated user, validates token + expiry, then creates the membership.
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

  -- Upsert membership
  INSERT INTO public.organization_members (organization_id, user_id, role, active)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, active = true
  RETURNING id INTO v_member_id;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    WHERE id = v_inv.id;

  RETURN v_inv.organization_id;
END;
$$;

-- Ensure organization_members has the uniqueness needed by ON CONFLICT above
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_org_user_unique
  ON public.organization_members (organization_id, user_id);
