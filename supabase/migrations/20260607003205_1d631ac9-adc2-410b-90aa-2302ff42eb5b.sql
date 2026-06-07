
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ce_suggested_topics text[] NOT NULL DEFAULT '{}'::text[];

-- Extend the self-edit guard to also block this admin-controlled field.
CREATE OR REPLACE FUNCTION public.profiles_block_owner_admin_field_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF v_uid <> OLD.id THEN RETURN NEW; END IF;

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
  IF NEW.ce_suggested_topics IS DISTINCT FROM OLD.ce_suggested_topics AND NOT v_is_admin
    THEN RAISE EXCEPTION 'Forbidden: ce_suggested_topics is admin-controlled'; END IF;

  RETURN NEW;
END;
$function$;
