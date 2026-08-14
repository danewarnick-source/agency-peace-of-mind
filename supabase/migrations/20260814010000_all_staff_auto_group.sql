-- "All Staff" auto-group: a system-managed staff_groups row per org that
-- every active staff member automatically belongs to, so Company
-- Obligations can be targeted at "everyone" without an admin having to
-- remember to keep a manual roster in sync.

-- Wire membership into accept_invitation() — the RPC that actually inserts
-- into organization_members when a staffer completes signup from an invite
-- — so new staff land in All Staff at the moment they join, regardless of
-- which front-end flow got them there. Body is unchanged except for the
-- new block after the membership upsert.
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

  -- Upsert membership
  INSERT INTO public.organization_members (organization_id, user_id, role, active)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, active = true
  RETURNING id INTO v_member_id;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    WHERE id = v_inv.id;

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

-- Backfill for the existing TNS org: create the All Staff group if it
-- doesn't already exist, then add every currently-active organization
-- member who isn't already in it.
DO $$
DECLARE
  v_org_id uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
  v_group_id uuid;
BEGIN
  SELECT id INTO v_group_id
    FROM public.staff_groups
    WHERE organization_id = v_org_id AND name = 'All Staff'
    LIMIT 1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.staff_groups (organization_id, name, description, color)
    VALUES (
      v_org_id,
      'All Staff',
      'System-managed group — every staff member in this organization',
      '#6B7280'
    )
    RETURNING id INTO v_group_id;
  END IF;

  INSERT INTO public.staff_group_members (group_id, staff_id)
  SELECT v_group_id, om.user_id
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND om.active = true
  ON CONFLICT (group_id, staff_id) DO NOTHING;
END $$;
