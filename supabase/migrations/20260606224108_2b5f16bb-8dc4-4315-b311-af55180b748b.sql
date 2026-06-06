-- Fix 1: collapse super_admin role into admin within each agency.
UPDATE public.organization_members
SET role = 'admin'
WHERE role = 'super_admin';

-- Fix 3: add employment start/end dates to profiles, used as single source of truth for CE eligibility.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

-- Backfill start_date from existing hire_date so CE keeps working.
UPDATE public.profiles SET start_date = hire_date WHERE start_date IS NULL AND hire_date IS NOT NULL;

-- end_date must be on/after start_date when both are set.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_end_after_start_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_end_after_start_chk
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

-- Allow owner self-edit trigger to also block start_date/end_date (admin-controlled).
-- (Trigger logic already blocks hire_date; extend by recreating function.)
CREATE OR REPLACE FUNCTION public.profiles_block_owner_admin_field_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF v_uid <> OLD.id THEN RETURN NEW; END IF;
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
  IF NEW.start_date           IS DISTINCT FROM OLD.start_date           THEN RAISE EXCEPTION 'Forbidden: start_date is admin-controlled'; END IF;
  IF NEW.end_date             IS DISTINCT FROM OLD.end_date             THEN RAISE EXCEPTION 'Forbidden: end_date is admin-controlled'; END IF;
  IF NEW.team_id              IS DISTINCT FROM OLD.team_id              THEN RAISE EXCEPTION 'Forbidden: team_id is admin-controlled'; END IF;
  RETURN NEW;
END;
$function$;
