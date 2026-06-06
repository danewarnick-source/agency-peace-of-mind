
CREATE OR REPLACE FUNCTION public.profiles_block_owner_admin_field_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Service role / no JWT (server-side admin paths) bypass.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only restrict when the editor IS the row owner.
  IF v_uid <> OLD.id THEN
    RETURN NEW;
  END IF;

  -- Owner self-edit: reject changes to admin-controlled columns.
  IF NEW.staff_type_keys      IS DISTINCT FROM OLD.staff_type_keys      THEN RAISE EXCEPTION 'Forbidden: staff_type_keys is admin-controlled'; END IF;
  IF NEW.hourly_rate          IS DISTINCT FROM OLD.hourly_rate          THEN RAISE EXCEPTION 'Forbidden: hourly_rate is admin-controlled'; END IF;
  IF NEW.daily_rate           IS DISTINCT FROM OLD.daily_rate           THEN RAISE EXCEPTION 'Forbidden: daily_rate is admin-controlled'; END IF;
  IF NEW.worker_type          IS DISTINCT FROM OLD.worker_type          THEN RAISE EXCEPTION 'Forbidden: worker_type is admin-controlled'; END IF;
  IF NEW.ssn_last4            IS DISTINCT FROM OLD.ssn_last4            THEN RAISE EXCEPTION 'Forbidden: ssn_last4 is admin-controlled'; END IF;
  IF NEW.date_of_birth        IS DISTINCT FROM OLD.date_of_birth        THEN RAISE EXCEPTION 'Forbidden: date_of_birth is admin-controlled'; END IF;
  IF NEW.home_address         IS DISTINCT FROM OLD.home_address         THEN RAISE EXCEPTION 'Forbidden: home_address is admin-controlled'; END IF;
  IF NEW.employee_id          IS DISTINCT FROM OLD.employee_id          THEN RAISE EXCEPTION 'Forbidden: employee_id is admin-controlled'; END IF;
  IF NEW.position             IS DISTINCT FROM OLD.position             THEN RAISE EXCEPTION 'Forbidden: position is admin-controlled'; END IF;
  IF NEW.department           IS DISTINCT FROM OLD.department           THEN RAISE EXCEPTION 'Forbidden: department is admin-controlled'; END IF;
  IF NEW.hire_date            IS DISTINCT FROM OLD.hire_date            THEN RAISE EXCEPTION 'Forbidden: hire_date is admin-controlled'; END IF;
  IF NEW.team_id              IS DISTINCT FROM OLD.team_id              THEN RAISE EXCEPTION 'Forbidden: team_id is admin-controlled'; END IF;
  IF NEW.tenant_id            IS DISTINCT FROM OLD.tenant_id            THEN RAISE EXCEPTION 'Forbidden: tenant_id is admin-controlled'; END IF;
  IF NEW.system_role          IS DISTINCT FROM OLD.system_role          THEN RAISE EXCEPTION 'Forbidden: system_role is admin-controlled'; END IF;
  IF NEW.account_status       IS DISTINCT FROM OLD.account_status       THEN RAISE EXCEPTION 'Forbidden: account_status is admin-controlled'; END IF;
  IF NEW.is_active            IS DISTINCT FROM OLD.is_active            THEN RAISE EXCEPTION 'Forbidden: is_active is admin-controlled'; END IF;
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN RAISE EXCEPTION 'Forbidden: must_change_password is admin-controlled'; END IF;
  IF NEW.agency_name          IS DISTINCT FROM OLD.agency_name          THEN RAISE EXCEPTION 'Forbidden: agency_name is admin-controlled'; END IF;
  IF NEW.email                IS DISTINCT FROM OLD.email                THEN RAISE EXCEPTION 'Forbidden: email is admin-controlled'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_owner_admin_field_writes ON public.profiles;
CREATE TRIGGER profiles_block_owner_admin_field_writes
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_owner_admin_field_writes();
