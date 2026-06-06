
-- Centralized helper: is the caller an admin (or manager) in any active org?
-- Replaces ad-hoc super_admin checks. SECURITY DEFINER avoids RLS recursion.
CREATE OR REPLACE FUNCTION public.is_admin_anywhere(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user
      AND active = true
      AND role IN ('admin','manager')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_anywhere(uuid) TO authenticated, service_role;

-- Fix the self-edit guard so admins/managers CAN set their own start/end/hire date
-- (a solo agency owner is both admin and employee). Non-admin staff are still
-- blocked from changing admin-controlled fields on their own profile.
CREATE OR REPLACE FUNCTION public.profiles_block_owner_admin_field_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF v_uid <> OLD.id THEN RETURN NEW; END IF;

  -- Admin/Manager editing their own profile: allow admin-controlled fields.
  v_is_admin := public.is_admin_anywhere(v_uid);

  IF NEW.staff_type_keys IS DISTINCT FROM OLD.staff_type_keys AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: staff_type_keys is admin-controlled'; END IF;
  IF NEW.hourly_rate     IS DISTINCT FROM OLD.hourly_rate     AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: hourly_rate is admin-controlled'; END IF;
  IF NEW.daily_rate      IS DISTINCT FROM OLD.daily_rate      AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: daily_rate is admin-controlled'; END IF;
  IF NEW.worker_type     IS DISTINCT FROM OLD.worker_type     AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: worker_type is admin-controlled'; END IF;
  IF NEW.ssn_last4       IS DISTINCT FROM OLD.ssn_last4       AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: ssn_last4 is admin-controlled'; END IF;
  IF NEW.date_of_birth   IS DISTINCT FROM OLD.date_of_birth   AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: date_of_birth is admin-controlled'; END IF;
  IF NEW.home_address    IS DISTINCT FROM OLD.home_address    AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: home_address is admin-controlled'; END IF;
  IF NEW.employee_id     IS DISTINCT FROM OLD.employee_id     AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: employee_id is admin-controlled'; END IF;
  IF NEW.position        IS DISTINCT FROM OLD.position        AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: position is admin-controlled'; END IF;
  IF NEW.department      IS DISTINCT FROM OLD.department      AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: department is admin-controlled'; END IF;
  IF NEW.hire_date       IS DISTINCT FROM OLD.hire_date       AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: hire_date is admin-controlled'; END IF;
  IF NEW.start_date      IS DISTINCT FROM OLD.start_date      AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: start_date is admin-controlled'; END IF;
  IF NEW.end_date        IS DISTINCT FROM OLD.end_date        AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: end_date is admin-controlled'; END IF;
  IF NEW.team_id         IS DISTINCT FROM OLD.team_id         AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: team_id is admin-controlled'; END IF;
  RETURN NEW;
END;
$$;

-- Retire the super_admin role helper: alias to the new centralized check so any
-- lingering RLS policy referencing is_super_admin() now lets current Admins through.
-- The role value itself is no longer assigned; this keeps existing policies working
-- without a sweeping refactor of every old migration.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_anywhere(_user);
$$;
