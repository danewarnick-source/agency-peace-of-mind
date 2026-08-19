CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_inv.role NOT IN ('admin', 'employee') THEN
    RAISE EXCEPTION 'Invalid invitation role: %. Only admin and employee roles can be invited.', v_inv.role;
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
$function$;