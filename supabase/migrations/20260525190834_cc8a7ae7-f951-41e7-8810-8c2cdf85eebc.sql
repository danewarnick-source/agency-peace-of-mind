-- 1) Extend existing caseload mapping with group-home flag
ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS is_group_home_assignment boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_staff_assign_org_staff
  ON public.staff_assignments (organization_id, staff_id);

-- 2) Friendly alias view requested by spec. RLS is enforced via the base table.
DROP VIEW IF EXISTS public.employee_client_assignments;
CREATE VIEW public.employee_client_assignments
WITH (security_invoker = true) AS
SELECT
  sa.id,
  sa.organization_id            AS tenant_id,
  sa.organization_id,
  sa.staff_id                   AS employee_id,
  sa.client_id,
  sa.is_group_home_assignment,
  sa.created_at,
  sa.created_by
FROM public.staff_assignments sa;

GRANT SELECT ON public.employee_client_assignments TO authenticated;

-- 3) Caseload resolver with group-home override.
--    Returns the staff member's assigned clients, plus every other client in the
--    same organization that shares a physical_address with a group-home assigned client.
CREATE OR REPLACE FUNCTION public.clients_for_staff(_org uuid, _staff uuid)
RETURNS SETOF public.clients
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH direct AS (
    SELECT c.*
      FROM public.clients c
      JOIN public.staff_assignments sa
        ON sa.client_id = c.id
       AND sa.organization_id = c.organization_id
     WHERE sa.organization_id = _org
       AND sa.staff_id = _staff
  ),
  group_home_addrs AS (
    SELECT DISTINCT c.physical_address
      FROM public.clients c
      JOIN public.staff_assignments sa
        ON sa.client_id = c.id
       AND sa.organization_id = c.organization_id
     WHERE sa.organization_id = _org
       AND sa.staff_id = _staff
       AND sa.is_group_home_assignment = true
       AND c.physical_address IS NOT NULL
       AND length(btrim(c.physical_address)) > 0
  ),
  facility_mates AS (
    SELECT c.*
      FROM public.clients c
     WHERE c.organization_id = _org
       AND c.physical_address IN (SELECT physical_address FROM group_home_addrs)
  )
  SELECT * FROM direct
  UNION
  SELECT * FROM facility_mates;
$$;

GRANT EXECUTE ON FUNCTION public.clients_for_staff(uuid, uuid) TO authenticated;

-- 4) No-note, no-clock-out guardrail.
CREATE OR REPLACE FUNCTION public.enforce_shift_note_on_clockout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_note_text text;
  v_transitioning_to_completed boolean;
  v_setting_clock_out boolean;
BEGIN
  v_transitioning_to_completed :=
    (NEW.status = 'completed'::shift_status)
    AND (OLD.status IS DISTINCT FROM 'completed'::shift_status);

  v_setting_clock_out :=
    (NEW.clock_out_time IS NOT NULL)
    AND (OLD.clock_out_time IS NULL);

  IF v_transitioning_to_completed OR v_setting_clock_out THEN
    SELECT sn.narrative_summary
      INTO v_note_text
      FROM public.shift_notes sn
     WHERE sn.shift_id = NEW.id
     LIMIT 1;

    IF v_note_text IS NULL OR length(btrim(v_note_text)) = 0 THEN
      RAISE EXCEPTION
        'Cannot clock out: a daily progress narrative note is required for this shift before completion.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_shift_note_on_clockout ON public.shifts;
CREATE TRIGGER trg_enforce_shift_note_on_clockout
BEFORE UPDATE ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_shift_note_on_clockout();