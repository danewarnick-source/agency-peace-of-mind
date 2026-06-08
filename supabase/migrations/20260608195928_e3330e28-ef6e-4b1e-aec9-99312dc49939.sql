
CREATE OR REPLACE FUNCTION public.auto_check_intake_from_form_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_form        record;
  v_behavior    text;
  v_req_key     text;
  v_req_id      uuid;
  v_form_name   text;
BEGIN
  -- Only act when reaching 'submitted'. Drafts never flip anything.
  IF NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN
    -- already processed at the original submit; stay idempotent
    -- (fall through still safe due to conflict guards, but skip work)
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, name, settings, organization_id
    INTO v_form
    FROM public.forms
   WHERE id = NEW.form_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_behavior  := COALESCE(v_form.settings->>'routing_behavior', '');
  v_form_name := COALESCE(v_form.name, '(form)');

  -- Scope guard: only these two behaviors trigger a completion write.
  IF v_behavior NOT IN ('client_intake_required', 'one_time_attestation') THEN
    RETURN NEW;
  END IF;

  -- Look up the mapped company_required intake requirement for this form.
  v_req_key := 'company_required:form:' || v_form.id::text;
  SELECT r.id INTO v_req_id
    FROM public.nectar_requirements r
   WHERE r.organization_id = v_form.organization_id
     AND r.requirement_key = v_req_key
     AND COALESCE(r.metadata->>'scope','') = 'hr_client_intake'
     AND r.approval_state = 'provider_confirmed'
   LIMIT 1;

  -- one_time_attestation with no mapping = just file; no checklist write.
  IF v_req_id IS NULL THEN
    RETURN NEW;
  END IF;

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
    -- Never overwrite a manual waived / not_applicable / already-complete.
    WHERE public.client_intake_completion.status
            NOT IN ('waived','not_applicable','complete');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_check_intake_from_form_submission ON public.form_submissions;
CREATE TRIGGER trg_auto_check_intake_from_form_submission
AFTER INSERT OR UPDATE OF status ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.auto_check_intake_from_form_submission();
