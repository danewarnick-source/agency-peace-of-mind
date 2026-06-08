-- Stage 1: enable per-(staff, client) completion on staff_checklist_completion.
-- Additive + backward-compatible. Existing NULL-client rows behave exactly as today.

-- 1) New nullable column with FK + cascade delete.
ALTER TABLE public.staff_checklist_completion
  ADD COLUMN IF NOT EXISTS client_id uuid
  REFERENCES public.clients(id) ON DELETE CASCADE;

-- 2) Drop the legacy full UNIQUE so per-client rows can share (staff_id, requirement_id).
ALTER TABLE public.staff_checklist_completion
  DROP CONSTRAINT IF EXISTS staff_checklist_completion_staff_id_requirement_id_key;

-- 3) Partial unique: exactly one general row per (staff, requirement) when no client.
CREATE UNIQUE INDEX IF NOT EXISTS scc_unique_general
  ON public.staff_checklist_completion (staff_id, requirement_id)
  WHERE client_id IS NULL;

-- 4) Partial unique: exactly one row per (staff, requirement, client) when client is set.
CREATE UNIQUE INDEX IF NOT EXISTS scc_unique_per_client
  ON public.staff_checklist_completion (staff_id, requirement_id, client_id)
  WHERE client_id IS NOT NULL;

-- 5) Lookup index for future per-client reads (no cost to current reads).
CREATE INDEX IF NOT EXISTS idx_scc_org_client
  ON public.staff_checklist_completion (organization_id, client_id)
  WHERE client_id IS NOT NULL;

-- 6) Repoint trigger function: training auto-check still writes general (NULL-client)
--    row, but ON CONFLICT must name the partial index predicate so Postgres picks
--    scc_unique_general (and so the new per-client partial index is not chosen).
CREATE OR REPLACE FUNCTION public.auto_check_hr_from_training()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
BEGIN
  IF NEW.is_current = false THEN RETURN NEW; END IF;
  IF NEW.topic_kind <> 'core' THEN RETURN NEW; END IF;

  FOR rec IN
    SELECT om.organization_id, r.id AS requirement_id
    FROM public.organization_members om
    JOIN public.training_checklist_mappings m
      ON m.training_topic_id = NEW.ref_id AND m.is_active
    JOIN public.nectar_requirements r
      ON r.organization_id = om.organization_id
     AND r.requirement_key = m.requirement_key
     AND r.approval_state = 'provider_confirmed'
     AND COALESCE(r.metadata->>'scope','') = 'hr_staff_checklist'
    WHERE om.user_id = NEW.user_id
      AND om.active = true
  LOOP
    INSERT INTO public.staff_checklist_completion (
      organization_id, staff_id, requirement_id, client_id, status,
      completed_date, completed_by, training_completion_id, auto_checked_at,
      notes
    ) VALUES (
      rec.organization_id, NEW.user_id, rec.requirement_id, NULL, 'complete',
      (NEW.completed_at AT TIME ZONE 'UTC')::date, NEW.user_id, NEW.id, now(),
      'Auto-checked from signed training: ' || COALESCE(NEW.topic_title, NEW.topic_code, '(topic)')
    )
    ON CONFLICT (staff_id, requirement_id) WHERE client_id IS NULL DO UPDATE
      SET status = 'complete',
          completed_date = EXCLUDED.completed_date,
          completed_by = EXCLUDED.completed_by,
          training_completion_id = EXCLUDED.training_completion_id,
          auto_checked_at = EXCLUDED.auto_checked_at,
          notes = EXCLUDED.notes,
          updated_at = now();
  END LOOP;
  RETURN NEW;
END $function$;

-- 7) Repoint trigger function: staff-mandate auto-check from form_submissions.
--    Only Branch 2 (staff_mandate) writes to staff_checklist_completion; Branch 1
--    (client_intake_completion) is unchanged. Waived/NA/complete preservation
--    predicate is preserved verbatim.
CREATE OR REPLACE FUNCTION public.auto_check_intake_from_form_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_form         record;
  v_behavior     text;
  v_req_key      text;
  v_req_id       uuid;
  v_form_name    text;
  v_target_staff uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT id, name, settings, organization_id
    INTO v_form
    FROM public.forms
   WHERE id = NEW.form_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_behavior  := COALESCE(v_form.settings->>'routing_behavior', '');
  v_form_name := COALESCE(v_form.name, '(form)');
  v_req_key   := 'company_required:form:' || v_form.id::text;

  -- Branch 1: client_intake_required / one_time_attestation (unchanged).
  IF v_behavior IN ('client_intake_required', 'one_time_attestation') THEN
    IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

    SELECT r.id INTO v_req_id
      FROM public.nectar_requirements r
     WHERE r.organization_id = v_form.organization_id
       AND r.requirement_key = v_req_key
       AND COALESCE(r.metadata->>'scope','') = 'hr_client_intake'
       AND r.approval_state = 'provider_confirmed'
     LIMIT 1;
    IF v_req_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.client_intake_completion (
      organization_id, client_id, requirement_id, status,
      completed_date, completed_by, notes
    ) VALUES (
      v_form.organization_id, NEW.client_id, v_req_id, 'complete',
      (NEW.submitted_at AT TIME ZONE 'UTC')::date,
      NEW.submitted_by,
      'Auto-checked from form submission ' || NEW.id::text || ' — ' || v_form_name
    )
    ON CONFLICT (client_id, requirement_id) DO UPDATE
      SET status         = 'complete',
          completed_date = EXCLUDED.completed_date,
          completed_by   = EXCLUDED.completed_by,
          notes          = EXCLUDED.notes,
          updated_at     = now()
      WHERE public.client_intake_completion.status
              NOT IN ('waived','not_applicable','complete');

    RETURN NEW;
  END IF;

  -- Branch 2: staff_mandate (still per_staff this stage; writes NULL-client general row).
  IF v_behavior = 'staff_mandate' THEN
    BEGIN
      v_target_staff := NULLIF(NEW.answers->>'__target_staff_id','')::uuid;
    EXCEPTION WHEN others THEN
      v_target_staff := NULL;
    END;
    IF v_target_staff IS NULL THEN
      v_target_staff := NEW.submitted_by;
    END IF;
    IF v_target_staff IS NULL THEN RETURN NEW; END IF;

    SELECT r.id INTO v_req_id
      FROM public.nectar_requirements r
     WHERE r.organization_id = v_form.organization_id
       AND r.requirement_key = v_req_key
       AND COALESCE(r.metadata->>'scope','') = 'hr_staff_checklist'
       AND r.approval_state = 'provider_confirmed'
     LIMIT 1;
    IF v_req_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.staff_checklist_completion (
      organization_id, staff_id, requirement_id, client_id, status,
      completed_date, completed_by, notes, auto_checked_at
    ) VALUES (
      v_form.organization_id, v_target_staff, v_req_id, NULL, 'complete',
      (NEW.submitted_at AT TIME ZONE 'UTC')::date,
      NEW.submitted_by,
      'Auto-checked from staff-mandate submission ' || NEW.id::text || ' — ' || v_form_name,
      now()
    )
    ON CONFLICT (staff_id, requirement_id) WHERE client_id IS NULL DO UPDATE
      SET status          = 'complete',
          completed_date  = EXCLUDED.completed_date,
          completed_by    = EXCLUDED.completed_by,
          notes           = EXCLUDED.notes,
          auto_checked_at = now(),
          updated_at      = now()
      WHERE public.staff_checklist_completion.status
              NOT IN ('waived','not_applicable','complete');

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;