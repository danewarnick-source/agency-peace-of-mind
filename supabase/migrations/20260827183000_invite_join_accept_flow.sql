-- Invite-join flow: people who follow an invite must land in the inviting
-- org, not a brand-new agency. accept_invitation() already existed and is
-- the only membership writer for this path; this restores the All Staff
-- add + duplicate-revoke body that a later replace dropped, skips the
-- handle_new_user personal-workspace insert for invitation/manual staff,
-- and deactivates a leftover personal-workspace membership if one was
-- created in the last two hours.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_space_pos INT;
  v_created_via TEXT;
BEGIN
  v_full_name := NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), '');
  IF v_full_name IS NOT NULL THEN
    v_space_pos := position(' ' IN v_full_name);
    IF v_space_pos > 0 THEN
      v_first_name := btrim(substring(v_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name := NULLIF(btrim(substring(v_full_name FROM v_space_pos + 1)), '');
    ELSE
      v_first_name := v_full_name;
      v_last_name := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, agency_name, first_name, last_name)
  VALUES (NEW.id, NEW.email, v_full_name, NEW.raw_user_meta_data->>'agency_name', v_first_name, v_last_name)
  ON CONFLICT (id) DO NOTHING;

  -- Invite join and Add-manually already attach the person to a real org.
  -- Do not spin up "{email}'s workspace" for those paths.
  v_created_via := coalesce(NEW.raw_user_meta_data->>'created_via', '');
  IF v_created_via IN ('invitation', 'manual_admin') THEN
    RETURN NEW;
  END IF;

  org_name := COALESCE(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 1) || '''s workspace');

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (org_name, lower(regexp_replace(org_name || '-' || substr(NEW.id::text, 1, 6), '[^a-z0-9]+', '-', 'g')), NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$;

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

  -- Employees invite UI allows admin / manager / employee. Elevation past
  -- that still goes through Team Access after they join.
  IF v_inv.role NOT IN ('admin', 'employee', 'manager') THEN
    RAISE EXCEPTION 'Invalid invitation role: %. Only admin, manager, and employee roles can be invited.', v_inv.role;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, active)
  VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role, active = true
  RETURNING id INTO v_member_id;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    WHERE id = v_inv.id;

  UPDATE public.invitations
    SET status = 'revoked'
    WHERE organization_id = v_inv.organization_id
      AND lower(email) = lower(v_email)
      AND status = 'pending'
      AND id <> v_inv.id;

  -- Leftover personal workspace from handle_new_user (only if created just
  -- now for this user). Do not touch older memberships in other real orgs.
  UPDATE public.organization_members om
     SET active = false
    FROM public.organizations o
   WHERE om.organization_id = o.id
     AND om.user_id = auth.uid()
     AND o.created_by = auth.uid()
     AND om.organization_id <> v_inv.organization_id
     AND om.role = 'admin'
     AND om.created_at > now() - interval '2 hours';

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

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'employee', 'manager'));
