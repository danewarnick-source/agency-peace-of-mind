-- Seed standing / previously-untracked DHHS91172 duties for True North
-- Supports. Idempotent on (organization_id, title). The app also bootstraps
-- these on first Compliance-register open for any org; this migration
-- covers environments that apply SQL without waiting for that visit.
DO $$
DECLARE
  v_org_id uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
  v_all_staff_group_id uuid;
BEGIN
  SELECT id INTO v_all_staff_group_id
    FROM public.staff_groups
    WHERE organization_id = v_org_id AND name = 'All Staff'
    LIMIT 1;

  IF v_all_staff_group_id IS NULL THEN
    RAISE EXCEPTION 'All Staff group not found for org % — run the all_staff_auto_group migration first', v_org_id;
  END IF;

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Emergency Management and Business Continuity Plan',
    'Keep a current Emergency Management and Business Continuity Plan on file (CST 46). This is a standing capability, not a recurring class.',
    'CST 46', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Emergency Management and Business Continuity Plan');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Annual Emergency Management Plan Training',
    'Staff are trained at least annually on the Contractor''s Emergency Management and Business Continuity Plan (CST 46). Separate from the 30-day orientation.',
    'CST 46', 'annually', '{"anniversary_based": true, "start_year": 1}'::jsonb, ARRAY[30, 14],
    'upload_and_attestation',
    'I attest that I have completed annual training on this organization''s Emergency Management and Business Continuity Plan.',
    true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Annual Emergency Management Plan Training');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Staff Conflict of Interest Process',
    'A written process for addressing staff conflict of interest (CST 9 & 10). Policy on file; not a per-period upload unless the policy changes.',
    'CST 9 & 10', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Staff Conflict of Interest Process');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Person Discharge Process',
    'Written discharge procedure for when a Person leaves services (SOW §1.22(c)). Triggered by a discharge, not a calendar.',
    'SOW Article 1.22 (c)', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Person Discharge Process');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Internal Quality Management Plan',
    'Internal Quality Management Plan is followed and can be externally validated (CST 50).',
    'CST 50', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Internal Quality Management Plan');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'General, Professional, and Automobile Liability Insurance',
    'Current General, Professional, and Automobile liability insurance at contracted minimums (CST 29–36). Track expiration on the declarations page.',
    'CST 29–36', 'annually', '{"month": 7, "day_of_month": 1}'::jsonb, ARRAY[60, 30, 14],
    'upload', false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'General, Professional, and Automobile Liability Insurance');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'DHHS Code of Conduct — Signed',
    'Staff assigned to SLN, SLH, HHS, or PPS have a signed DHHS Code of Conduct on file (CST 76).',
    'CST 76', 'one_time', '{"days_after_hire": 30}'::jsonb, ARRAY[14, 7],
    'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY['SLN', 'SLH', 'HHS', 'PPS'],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'DHHS Code of Conduct — Signed');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'ABI Training — Before Working Alone',
    'Staff serving Persons with acquired brain injury complete ABI training before working alone (behavior effects, hospital-to-community transition, functional impact, health/medication, staff role, family perspective). SOW §1.8.',
    'SOW Article 1.8 (ABI training)', 'one_time', '{"days_after_hire": 0}'::jsonb, ARRAY[14, 7, 3],
    'upload_and_attestation',
    'I attest that I have completed ABI training covering behavior effects, hospital-to-community transition, functional impact, health and medication, the staff role, and family perspective, and that I will not work alone with a Person with ABI until this is on file.',
    true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'ABI Training — Before Working Alone');
END $$;
