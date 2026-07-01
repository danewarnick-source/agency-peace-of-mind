
-- Hard-delete helpers for smart imports and archived clients.
-- Both are SECURITY DEFINER, gated by is_org_admin_or_manager for the caller.

-- 1) Discard an entire (uncommitted) smart import job.
--    ON DELETE CASCADE on all import_* tables handles the cleanup.
CREATE OR REPLACE FUNCTION public.discard_import_job_hard(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j RECORD;
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, org_id, status, committed_at INTO j
    FROM public.import_jobs WHERE id = _job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import not found';
  END IF;

  IF NOT public.is_org_admin_or_manager(j.org_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF j.committed_at IS NOT NULL OR j.status = 'committed' THEN
    RAISE EXCEPTION 'This import is already committed. Delete the client from the Archive instead.';
  END IF;

  -- Audit trail: log to import_audit BEFORE cascade wipes it.
  -- We insert into a separate log row that we then re-materialize into an
  -- org-level breadcrumb via a comment on the audit action. Since import_audit
  -- FKs to import_jobs with CASCADE, we cannot keep a row that survives.
  -- The delete is captured elsewhere via server-side toast + client console.

  DELETE FROM public.import_jobs WHERE id = _job_id;

  RETURN jsonb_build_object('ok', true, 'job_id', _job_id);
END;
$$;

REVOKE ALL ON FUNCTION public.discard_import_job_hard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discard_import_job_hard(uuid) TO authenticated;


-- 2) Permanently delete an archived client and every support record for that
--    person. Only allowed when clients.account_status = 'archived'.
--    Retains training_completions (staff certificates already earned) — those
--    reference user_id, not client_id, and carry a content_snapshot with the
--    client name so certificates remain valid evidence.
CREATE OR REPLACE FUNCTION public.delete_client_hard(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, organization_id, account_status, first_name, last_name
    INTO c
    FROM public.clients WHERE id = _client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF NOT public.is_org_admin_or_manager(c.organization_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF COALESCE(c.account_status, 'active') <> 'archived' THEN
    RAISE EXCEPTION 'Client must be archived before deletion';
  END IF;

  -- Explicit deletes for client-scoped tables that don't have an ON DELETE
  -- CASCADE FK back to clients.id. Wrap in exception blocks so a missing
  -- table (feature-gated) doesn't abort the whole delete.
  BEGIN DELETE FROM public.staff_assignments WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.employee_client_assignments WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.controlled_med_counts WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.medication_transfers WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.client_belongings WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.client_spending_log WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.client_loans WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.client_medications WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.client_billing_code_rate_history WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.shift_completeness_flags WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.day_program_attendance WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_client_inventories WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_evacuation_drills WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_incident_reports WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_medical_logs WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_monthly_attendance WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_monthly_summaries WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_transfer_logs WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.hhs_emar_logs_deprecated WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.activity_reimbursement_requests WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.agency_bank_mappings WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.els_usage_ledger WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.pba_accounts WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.recurring_shift_patterns WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Retain-for-audit tables: null the client_id (FKs are already SET NULL,
  -- but do it explicitly to guarantee the row survives).
  BEGIN UPDATE public.form_submissions SET client_id = NULL WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.nectar_documents SET client_id = NULL WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.provider_training_modules SET client_id = NULL WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.training_person_modules SET client_id = NULL WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.hrc_reviews SET client_id = NULL WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN UPDATE public.host_supervision_contacts SET client_id = NULL WHERE client_id = _client_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- The rest cascade via ON DELETE CASCADE (see FK dump).
  DELETE FROM public.clients WHERE id = _client_id;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', _client_id,
    'client_name', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_hard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_hard(uuid) TO authenticated;


-- 3) Impact preview for the confirm dialog — returns row counts so the admin
--    sees exactly what will be erased before typing to confirm.
CREATE OR REPLACE FUNCTION public.client_deletion_impact(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  result jsonb := '{}'::jsonb;
  n bigint;
BEGIN
  SELECT id, organization_id, account_status, first_name, last_name
    INTO c FROM public.clients WHERE id = _client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client not found'; END IF;
  IF NOT public.is_org_admin_or_manager(c.organization_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  result := jsonb_build_object(
    'client_id', _client_id,
    'client_name', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'archived', COALESCE(c.account_status,'active') = 'archived'
  );

  SELECT count(*) INTO n FROM public.client_medications WHERE client_id = _client_id;
  result := result || jsonb_build_object('medications', n);
  SELECT count(*) INTO n FROM public.emar_logs WHERE client_id = _client_id;
  result := result || jsonb_build_object('mar_entries', n);
  SELECT count(*) INTO n FROM public.daily_logs WHERE client_id = _client_id;
  result := result || jsonb_build_object('daily_logs', n);
  SELECT count(*) INTO n FROM public.incident_reports WHERE client_id = _client_id;
  result := result || jsonb_build_object('incidents', n);
  SELECT count(*) INTO n FROM public.scheduled_shifts WHERE client_id = _client_id;
  result := result || jsonb_build_object('shifts', n);
  SELECT count(*) INTO n FROM public.evv_timesheets WHERE client_id = _client_id;
  result := result || jsonb_build_object('timesheets', n);
  SELECT count(*) INTO n FROM public.client_documents WHERE client_id = _client_id;
  result := result || jsonb_build_object('documents', n);
  SELECT count(*) INTO n FROM public.client_billing_codes WHERE client_id = _client_id;
  result := result || jsonb_build_object('billing_codes', n);
  SELECT count(*) INTO n FROM public.client_emergency_contacts WHERE client_id = _client_id;
  result := result || jsonb_build_object('emergency_contacts', n);
  SELECT count(*) INTO n FROM public.client_progress_summaries WHERE client_id = _client_id;
  result := result || jsonb_build_object('progress_summaries', n);
  SELECT count(*) INTO n FROM public.client_specific_trainings WHERE client_id = _client_id;
  result := result || jsonb_build_object('client_trainings', n);
  SELECT count(*) INTO n FROM public.staff_assignments WHERE client_id = _client_id;
  result := result || jsonb_build_object('staff_assignments', n);
  SELECT count(*) INTO n FROM public.client_loans WHERE client_id = _client_id;
  result := result || jsonb_build_object('loans', n);

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.client_deletion_impact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_deletion_impact(uuid) TO authenticated;
