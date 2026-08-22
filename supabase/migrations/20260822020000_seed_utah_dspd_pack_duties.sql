-- Seed DHHS91172 pack duties that were missing from the first standing-duty
-- set. Idempotent on (organization_id, title). The app also bootstraps these
-- on first Compliance-register open; this migration covers TNS without
-- waiting for that visit.
DO $$
DECLARE
  v_org_id uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
BEGIN
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'DHHS Medicaid 101 Training — Contractor',
    'Contractor-level DHHS Medicaid 101 within 30 days of a fully executed contract and annually thereafter (SOW §1.7(1)). Separate from the staff orientation Medicaid 101 topic.',
    'SOW Article 1.7 (1)', 'annually', '{"month": 7, "day_of_month": 31}'::jsonb, ARRAY[30, 14],
    'upload_and_attestation',
    'I attest that this contractor completed DHHS Medicaid 101 for the current contract year and that applicable portions have been trained to staff.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'DHHS Medicaid 101 Training — Contractor');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Utah Medicaid Provider Manuals — Annual Memo',
    'Read Utah Medicaid provider manuals and rules within 90 days of contract execution and annually thereafter; file a memo (SOW §1.7(2)). Same review covers DSPD R539 and DHHS rules (§1.7(3)–(4)).',
    'SOW Article 1.7 (2)–(4)', 'annually', '{"month": 9, "day_of_month": 28}'::jsonb, ARRAY[30, 14],
    'upload_and_attestation',
    'I attest that this contractor has read and is familiar with the Utah Medicaid provider manuals, Medicaid rules, DSPD R539, and applicable DHHS rules, and that the required memo is on file.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Utah Medicaid Provider Manuals — Annual Memo');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Volunteer Training File — When Volunteers Are Used',
    'When regularly scheduled volunteers are used, keep written training covering SOW §1.6(3) topics. Friends and natural supports the Person chooses are not volunteers.',
    'SOW Article 1.6', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Volunteer Training File — When Volunteers Are Used');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'USTEPS and UPI Contractor Accounts',
    'Keep current USTEPS and UPI accounts plus DSPD forms 0-9 (company designee) and 0-8 (at least one individual user) (SOW §1.4(2), §1.15).',
    'SOW Article 1.4 (2) / 1.15', 'per_event', '{}'::jsonb, ARRAY[]::integer[],
    'upload_and_attestation',
    'I attest that this contractor has a current USTEPS and UPI account and that the 0-9 company designee and at least one 0-8 individual user form are on file.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'USTEPS and UPI Contractor Accounts');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Medicaid Provider Enrollment — Current',
    'Stay enrolled as a Medicaid provider for the Community Support, Community Transition, and ABI waivers (SOW §1.4(1), §1.13).',
    'SOW Article 1.4 (1) / 1.13', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Medicaid Provider Enrollment — Current');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Medicaid Provider Change Notifications',
    'Notify DSPD of contact changes within 7 calendar days and ownership / legal name / EIN changes within 30 calendar days (SOW §1.13(2)–(3)). Produce Medicaid provider documents within 7 days of a written DSPD request.',
    'SOW Article 1.13 (2)–(3)', 'per_event', '{}'::jsonb, ARRAY[]::integer[],
    'upload_and_attestation',
    'I attest that no unreported Medicaid-provider change is outstanding, and that any notice required by SOW §1.13 has been sent on time.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Medicaid Provider Change Notifications');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'No Gifts or Purchases-from-Staff Process',
    'Written process that contractor and staff do not accept money from a Person and do not let a Person make purchases from the contractor or staff (SOW §1.28(9)–(10)).',
    'SOW Article 1.28 (9) & (10)', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'No Gifts or Purchases-from-Staff Process');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Governing or Policy-Making Board Records',
    'If the contractor has a governing or policy-making board: keep by-laws, meet at least quarterly, and keep minutes (SOW §1.14).',
    'SOW Article 1.14', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Governing or Policy-Making Board Records');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Personnel Policies and Job Descriptions',
    'Written personnel policies and a job description for each staff position (SOW §1.17).',
    'SOW Article 1.17', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Personnel Policies and Job Descriptions');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Operating Policies and Procedures',
    'Written operating policies covering staff/supervisory responsibilities, transportation, grievances, and emergency procedures (SOW §1.18).',
    'SOW Article 1.18', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Operating Policies and Procedures');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Human Rights Plan',
    'Written Human Rights Plan in compliance with the HCBS Settings Rule (SOW §1.21). Separate from the live HRC roster. Required unless the contractor only provides CHA, HSQ, or PBA.',
    'SOW Article 1.21', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Human Rights Plan');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Health Support Policies and Procedures',
    'Written health-support policies for Persons'' medical needs (SOW §1.23). Day-to-day medical records are Person artifacts.',
    'SOW Article 1.23', 'per_event', '{}'::jsonb, ARRAY[]::integer[], 'upload', false,
    ARRAY[]::uuid[], 'admin_only', 'org', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Health Support Policies and Procedures');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Housemate Informed-Choice Discussion',
    'For HHS, PPS, or RHS: document an informed discussion about housemates and household accommodations at placement and any change on or after July 1, 2026 (SOW §1.35).',
    'SOW Article 1.35', 'per_event', '{}'::jsonb, ARRAY[]::integer[],
    'upload_and_attestation',
    'I attest that each Person receiving residential services has a written informed-choice housemate discussion on file, updated when a housemate changes.',
    false, ARRAY[]::uuid[], 'managers_only', 'org', ARRAY['HHS', 'PPS', 'RHS'],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Housemate Informed-Choice Discussion');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'DSI Annual Outcome Report — Google Form Submission',
    'Fiscal-year Day Supports outcome report via the DSPD Google Form by August 30 (SOW §8.6).',
    'SOW Article 8.6', 'annually', '{"month": 8, "day_of_month": 30}'::jsonb, ARRAY[30, 14],
    'upload_and_attestation',
    'I attest that the DSI / Day Supports fiscal-year outcome report was submitted on the DSPD Google Form for this reporting year.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY['DSI'],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'DSI Annual Outcome Report — Google Form Submission');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SEI Annual Outcome Report — Google Form Submission',
    'Fiscal-year SEI outcome report via the DSPD Google Form by August 30 (SOW §30.7).',
    'SOW Article 30.7', 'annually', '{"month": 8, "day_of_month": 30}'::jsonb, ARRAY[30, 14],
    'upload_and_attestation',
    'I attest that the SEI fiscal-year outcome report was submitted on the DSPD Google Form for this reporting year.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY['SEI'],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SEI Annual Outcome Report — Google Form Submission');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Supported Living Annual Outcome Report — Google Form Submission',
    'Fiscal-year Supported Living (SLH/SLN) outcome report via the DSPD Google Form by August 30 (SOW §31.5 / §32.7).',
    'SOW Article 31.5 / 32.7', 'annually', '{"month": 8, "day_of_month": 30}'::jsonb, ARRAY[30, 14],
    'upload_and_attestation',
    'I attest that the Supported Living fiscal-year outcome report was submitted on the DSPD Google Form for this reporting year.',
    false, ARRAY[]::uuid[], 'admin_only', 'org', ARRAY['SLH', 'SLN'],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Supported Living Annual Outcome Report — Google Form Submission');
END $$;
