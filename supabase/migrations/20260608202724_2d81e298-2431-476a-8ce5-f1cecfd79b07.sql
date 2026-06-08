
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
  -- Only act when reaching 'submitted'. Drafts never flip anything.
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

  -- ─────────────── Branch 1: client_intake_required / one_time_attestation
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

  -- ─────────────── Branch 2: staff_mandate (per_staff scope, this stage)
  IF v_behavior = 'staff_mandate' THEN
    -- Resolve target staffer: explicit override in answers, else submitter.
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
      organization_id, staff_id, requirement_id, status,
      completed_date, completed_by, notes, auto_checked_at
    ) VALUES (
      v_form.organization_id, v_target_staff, v_req_id, 'complete',
      (NEW.submitted_at AT TIME ZONE 'UTC')::date,
      NEW.submitted_by,
      'Auto-checked from staff-mandate submission ' || NEW.id::text || ' — ' || v_form_name,
      now()
    )
    ON CONFLICT (staff_id, requirement_id) DO UPDATE
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

  -- Other routing behaviors: no completion write.
  RETURN NEW;
END;
$function$;
