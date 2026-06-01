-- Add additive Company Executive role flag on organization memberships.
-- The four additive roles are derived as:
--   - Company Staff:     every active organization_members row
--   - Company Admin:     organization_members.role IN ('admin','super_admin')
--   - Company Executive: organization_members.is_company_executive = true (NEW)
--   - HIVE Executive:    public.hive_executives row with active = true
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS is_company_executive boolean NOT NULL DEFAULT false;

-- Server-side helper to check Company Executive grant for a (org,user).
CREATE OR REPLACE FUNCTION public.is_company_executive(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND active = true
      AND (is_company_executive = true OR role IN ('admin','super_admin'))
  )
$$;

-- Grant/revoke Company Executive on a membership. Only Company Admins of the
-- same org, super admins, or HIVE executives may toggle this flag.
CREATE OR REPLACE FUNCTION public.set_company_executive(_membership_id uuid, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.organization_members WHERE id = _membership_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Membership not found'; END IF;
  IF NOT (
    public.has_org_role(v_org, auth.uid(), 'admin'::app_role)
    OR public.is_super_admin(auth.uid())
    OR public.is_hive_executive(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage Company Executive role';
  END IF;
  UPDATE public.organization_members
    SET is_company_executive = _grant
  WHERE id = _membership_id;
END;
$$;

-- Grant/revoke HIVE Executive on a user. Only existing HIVE executives may grant.
CREATE OR REPLACE FUNCTION public.set_hive_executive(_user_id uuid, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hive_executive(auth.uid()) THEN
    RAISE EXCEPTION 'Only HIVE executives may grant the HIVE Executive role';
  END IF;
  IF _grant THEN
    INSERT INTO public.hive_executives (user_id, active)
    VALUES (_user_id, true)
    ON CONFLICT (user_id) DO UPDATE SET active = true;
  ELSE
    UPDATE public.hive_executives SET active = false WHERE user_id = _user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_company_executive(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_executive(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_hive_executive(uuid, boolean) TO authenticated;
