-- Seed the remaining ~29 SOW-mandated Company Obligations (DHHS91172) for
-- True North Supports: org-level (shared single instance, incl. per-client
-- documentation requirements treated as org-level for now), staff-level
-- (per-assignee, targeted by service code where applicable), and
-- staff_per_client (one instance per active staff+client assignment).
-- Every insert is guarded with WHERE NOT EXISTS on (organization_id, title)
-- so this migration is safe to re-run.
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

  -- ══════════════════════ ORG-LEVEL OBLIGATIONS (scope = 'org') ═══════════

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'OL Residential Support License — 4+ Persons per Site',
    'Maintain a current Office of Licensing Residential Support License for each RHS location serving 4 or more Persons. Required by SOW §21.5.',
    'SOW §21.5 — RHS Qualifications', 'annually', '{"month": 7, "day_of_month": 1}'::jsonb,
    ARRAY[60, 30, 14], 'upload', NULL, false, 'org', ARRAY['RHS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'OL Residential Support License — 4+ Persons per Site');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'OL Residential Support Certification — 3 or Fewer Persons per Site',
    'Maintain a current OL Residential Support Certification for each RHS location serving 3 or fewer Persons.',
    'SOW §21.5 — RHS Qualifications', 'annually', '{"month": 7, "day_of_month": 1}'::jsonb,
    ARRAY[60, 30, 14], 'upload', NULL, false, 'org', ARRAY['RHS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'OL Residential Support Certification — 3 or Fewer Persons per Site');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'OL Day Treatment License — 4+ Persons',
    NULL, 'SOW §8.5 (DSI), §7.5 (DSG/DSP) — Day Program Qualifications', 'annually',
    '{"month": 7, "day_of_month": 1}'::jsonb, ARRAY[60, 30, 14], 'upload', NULL,
    false, 'org', ARRAY['DSG', 'DSP', 'EPR', 'DSI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'OL Day Treatment License — 4+ Persons');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'OL Day Support Certification — 3 or Fewer Persons',
    NULL, 'SOW §8.5 (DSI), §7.5 (DSG/DSP)', 'annually',
    '{"month": 7, "day_of_month": 1}'::jsonb, ARRAY[60, 30, 14], 'upload', NULL,
    false, 'org', ARRAY['DSG', 'DSP', 'EPR', 'DSI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'OL Day Support Certification — 3 or Fewer Persons');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'USOR Approved Vendor — Job Coaching (SEI)',
    NULL, 'SOW §30.5 — SEI Qualifications', 'one_time', '{"date": "2027-01-31"}'::jsonb,
    ARRAY[90, 30, 14], 'upload_and_attestation',
    'I confirm this organization is an approved USOR vendor for job coaching services as required by SOW §30.5.',
    false, 'org', ARRAY['SEI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'USOR Approved Vendor — Job Coaching (SEI)');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'USOR Approved Vendor — Job Development (SJD)',
    NULL, 'SOW §33.5 — SJD Qualifications', 'one_time', '{"days_after_service_start": 180}'::jsonb,
    ARRAY[60, 30, 14], 'upload_and_attestation',
    'I confirm this organization is an approved USOR vendor for job development services. Proof submitted to osrprovider@utah.gov.',
    false, 'org', ARRAY['SJD'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'USOR Approved Vendor — Job Development (SJD)');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'HHS Annual Outcome Report — Google Form Submission',
    NULL, 'SOW §11.7 — HHS Outcomes', 'annually', '{"month": 8, "day_of_month": 30}'::jsonb,
    ARRAY[30, 14, 7], 'attestation',
    'I confirm the HHS Annual Outcome Report has been submitted via the DSPD Google Form by August 30, including: number of Persons who received HHS, percentage who remained in a community-based setting, and quality improvement activities.',
    false, 'org', ARRAY['HHS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'HHS Annual Outcome Report — Google Form Submission');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Zoning / Life Safety Code Compliance Documentation',
    'Maintain documentation of current compliance with zoning, Life Safety Code, and health and fire safety requirements for any licensed or certified locations.',
    'SOW §1.11 — Operational Records', 'annually', '{"month": 7, "day_of_month": 1}'::jsonb,
    ARRAY[30, 14], 'upload', NULL, false, 'org', ARRAY[]::text[], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Zoning / Life Safety Code Compliance Documentation');

  -- ── Client-level documentation, seeded as org-level for now ──────────────

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'HHS Quarterly Evacuation Drills — All Sites',
    NULL, 'SOW §11.3 — HHS Direct Service Admin', 'quarterly', '{"day_of_month": 1}'::jsonb,
    ARRAY[14, 7], 'upload_and_attestation',
    'I confirm quarterly evacuation drills have been conducted and documented at all active HHS sites this quarter.',
    false, 'org', ARRAY['HHS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'HHS Quarterly Evacuation Drills — All Sites');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'RHS Quarterly Evacuation Drills — All Sites',
    NULL, 'SOW §21.3 — RHS Direct Service Admin', 'quarterly', '{"day_of_month": 1}'::jsonb,
    ARRAY[14, 7], 'upload_and_attestation',
    'I confirm quarterly evacuation drills have been conducted and documented at all active RHS sites this quarter.',
    false, 'org', ARRAY['RHS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'RHS Quarterly Evacuation Drills — All Sites');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'PPS Quarterly Evacuation Drills — All Sites',
    NULL, 'SOW §20.3 — PPS Direct Service Admin', 'quarterly', '{"day_of_month": 1}'::jsonb,
    ARRAY[14, 7], 'upload_and_attestation',
    'I confirm quarterly evacuation drills have been conducted and documented at all active PPS sites this quarter.',
    false, 'org', ARRAY['PPS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'PPS Quarterly Evacuation Drills — All Sites');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'HHS Home Certification — Annual (DSPD Form)',
    'Conduct initial inspection and annual re-certification of each HHS home using the DSPD Host Home Certification form.',
    'SOW §11.5 — HHS Qualifications', 'annually', '{"month": 7, "day_of_month": 1}'::jsonb,
    ARRAY[30, 14], 'upload', NULL, false, 'org', ARRAY['HHS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'HHS Home Certification — Annual (DSPD Form)');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SEI Monthly Summary — UPI Entry Attestation',
    'Monthly summaries for SEI must be entered (not uploaded) directly into UPI by the 15th of the following month.',
    'SOW §30.3 — SEI Direct Service Admin', 'monthly', '{"day_of_month": 15}'::jsonb,
    ARRAY[7, 5, 3, 1], 'attestation',
    'I confirm I have entered the SEI monthly summary for all active SEI clients into UPI for the period above by the 15th of the following month.',
    false, 'org', ARRAY['SEI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SEI Monthly Summary — UPI Entry Attestation');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SEI Employment Data — UPI Entry Attestation',
    NULL, 'SOW §30.3 — SEI Direct Service Admin', 'monthly', '{"day_of_month": 15}'::jsonb,
    ARRAY[7, 5, 3, 1], 'attestation',
    'I confirm I have entered and maintained current employment data for all active SEI clients directly in UPI for the period above.',
    false, 'org', ARRAY['SEI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SEI Employment Data — UPI Entry Attestation');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SEI Employment Support Strategies — UPI Entry',
    'Employment support strategies must be entered into UPI within 2 weeks of any PCSP update. Log a new event each time a PCSP is updated for an SEI client.',
    'SOW §30.3 — SEI Direct Service Admin', 'per_event', '{"days_after_trigger": 14}'::jsonb,
    ARRAY[7, 3], 'attestation',
    'I confirm I have entered the updated employment support strategies for this client into UPI within 2 weeks of the PCSP update date.',
    false, 'org', ARRAY['SEI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SEI Employment Support Strategies — UPI Entry');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SJD Monthly Summary — UPI Entry Attestation',
    NULL, 'SOW §33.3 — SJD Direct Service Admin', 'monthly', '{"day_of_month": 15}'::jsonb,
    ARRAY[7, 5, 3, 1], 'attestation',
    'I confirm I have entered the SJD monthly summary for all active SJD clients into UPI for the period above by the 15th of the following month. Summary includes: employment activities, Person''s response, progress toward goals, weekly assessment data, USOR contact date and funding status.',
    false, 'org', ARRAY['SJD'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SJD Monthly Summary — UPI Entry Attestation');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SJD Employment Data — UPI Entry Attestation',
    NULL, 'SOW §33.3 — SJD Direct Service Admin', 'monthly', '{"day_of_month": 15}'::jsonb,
    ARRAY[7, 5, 3, 1], 'attestation',
    'I confirm I have entered and maintained current employment data for all active SJD clients directly in UPI for the period above.',
    false, 'org', ARRAY['SJD'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SJD Employment Data — UPI Entry Attestation');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SJD Monthly USOR Contact Verification',
    NULL, 'SOW §33.3 — SJD Direct Service Admin', 'monthly', '{"day_of_month": 15}'::jsonb,
    ARRAY[7, 5, 3, 1], 'attestation',
    'I confirm I have documented and verified with each active SJD client whether they received USOR outreach this month and recorded their current USOR funding status.',
    false, 'org', ARRAY['SJD'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SJD Monthly USOR Contact Verification');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'CMP/CMS Monthly Summaries — Submitted to SC',
    NULL, 'SOW §32.3 — SLN/CMP/CMS Direct Service Admin', 'monthly', '{"day_of_month": 15}'::jsonb,
    ARRAY[7, 5, 3, 1], 'attestation',
    'I confirm monthly summaries for all active CMP and CMS clients have been completed and submitted to each client''s Support Coordinator by the 15th of the following month.',
    false, 'org', ARRAY['CMP', 'CMS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'CMP/CMS Monthly Summaries — Submitted to SC');

  -- ══════════════════════ STAFF-LEVEL OBLIGATIONS (scope = 'staff') ═══════

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT v_org_id,
    'Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)',
    'Required for staff serving Persons likely to engage in aggressive, self-injurious, or destructive behavior. Must be completed within 180 days of hire. Certification must be maintained current. Accepted programs: SOAR, MANDT, PART, CPI, Safety Care, or DSPD-approved equivalent.',
    'SOW §1.8(6)', 'annually', '{"every_n_months": 24, "from": "cert_expiration"}'::jsonb,
    ARRAY[60, 30, 14], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true,
    'Behavior Intervention Certification',
    '[{"label":"Program","any_of":["soar","mandt","part","cpi","safety care","crisis prevention"]}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Behavior Intervention Certification (SOAR/MANDT/PART/CPI/Safety Care)');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Medicaid Disclosure Form — Annual',
    'Each staff member must complete the DHHS Medicaid Disclosure Form at hire and annually thereafter. Form available on the DSPD webpage.',
    'SOW §1.9(6) — Staff Records', 'annually', '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Medicaid Disclosure Form — Annual');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Training Documentation File — Maintained',
    'Maintain written documentation of each staff member''s successful completion of all required training areas. Documentation must allow an external reviewer to verify completion.',
    'SOW §1.9(3) — Staff Records', 'annually', '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Training Documentation File — Maintained');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Educational Credentials and Licenses — On File',
    'Copies of educational transcripts, degrees, letters, licenses, and certifications (when applicable to the position) must be on file for each staff member.',
    'SOW §1.9(4) — Staff Records', 'one_time', '{"days_after_hire": 30}'::jsonb,
    ARRAY[14, 7], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Educational Credentials and Licenses — On File');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Person-Centered Thinking and Practices Training',
    'All staff must complete training in person-centered thinking and practices within 90 days of employment. This is your staff training in person-centered thinking practices — separate from the Person-Centered Thinking profile you complete with each client (SOW §1.8(5)(C)).',
    'SOW §1.8(5)(C)', 'one_time', '{"days_after_hire": 90}'::jsonb,
    ARRAY[14, 7, 3], 'upload_and_attestation',
    'I confirm I have completed training in person-centered thinking and practices within 90 days of hire as required by SOW §1.8(5)(C).',
    true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Person-Centered Thinking and Practices Training');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT v_org_id,
    'ACRE Training Certification — SEI',
    'All SEI staff must be certified in ACRE training (Utah State University or accredited ACRE program) before providing services. All SEI staff must be supervised by an ACRE-certified staff member.',
    'SOW §30.5 — SEI Qualifications', 'one_time', '{"days_after_hire": 0}'::jsonb,
    ARRAY[14, 7, 3], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY['SEI'],
    true, true, true, 'sow', true,
    'ACRE Training',
    '[{"label":"ACRE","any_of":["acre","association of community rehabilitation","utah state university","usu workplace supports","effective job coach"]}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'ACRE Training Certification — SEI');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT v_org_id,
    'ACRE Training Certification — SED',
    NULL, 'SOW §28.4 — SED Qualifications', 'one_time', '{"days_after_hire": 0}'::jsonb,
    ARRAY[14, 7], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY['SED'],
    true, true, true, 'sow', true,
    'ACRE Training',
    '[{"label":"ACRE","any_of":["acre","association of community rehabilitation","utah state university","usu workplace supports"]}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'ACRE Training Certification — SED');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT v_org_id,
    'ACRE Training Certification — SJD (60 Days)',
    NULL, 'SOW §33.5 — SJD Qualifications', 'one_time', '{"days_after_hire": 60}'::jsonb,
    ARRAY[14, 7, 3], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY['SJD'],
    true, true, true, 'sow', true,
    'ACRE Training',
    '[{"label":"ACRE","any_of":["acre","association of community rehabilitation","customized employment"]}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'ACRE Training Certification — SJD (60 Days)');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT v_org_id,
    'Customized Employment Training (USU) — SEE/SJD',
    NULL, 'SOW §29.4 (SEE), §33.5 (SJD)', 'one_time', '{"days_after_hire": 0}'::jsonb,
    ARRAY[14, 7], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY['SEE', 'SJD'],
    true, true, true, 'sow', true,
    'Customized Employment Training',
    '[{"label":"CE Training","any_of":["customized employment","ceiutah","ce training","utah state university customized"]}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Customized Employment Training (USU) — SEE/SJD');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'SEI — SSI/Benefits Knowledge Attestation',
    NULL, 'SOW §30.5 — SEI Qualifications', 'one_time', '{"days_after_hire": 0}'::jsonb,
    ARRAY[7, 3], 'attestation',
    'I confirm that before providing Supported Employment services I have acquired a basic understanding of how earned income affects SSI, Social Security Title II benefits, Medicaid, and other public benefits, and I understand when to refer complex matters to USOR.',
    true, 'any_assigned', 'staff', ARRAY['SEI'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'SEI — SSI/Benefits Knowledge Attestation');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'HSQ — Clean, Sanitary & Safe Environment Training',
    NULL, 'SOW Article 12 — HSQ Qualifications', 'one_time', '{"days_after_hire": 0}'::jsonb,
    ARRAY[7, 3], 'upload_and_attestation',
    'I confirm I have been trained on maintaining a clean, sanitary, and safe living environment in accordance with HSQ service requirements and Contractor policies.',
    true, 'any_assigned', 'staff', ARRAY['HSQ'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'HSQ — Clean, Sanitary & Safe Environment Training');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT v_org_id,
    'Child Placing / Foster Care License (DHHS/OL) — PPS',
    NULL, 'SOW §20.5 — PPS Qualifications', 'annually', '{"every_n_months": 12, "from": "cert_expiration"}'::jsonb,
    ARRAY[60, 30, 14], 'upload', true, 'any_assigned', 'staff', ARRAY['PPS'],
    true, true, true, 'sow', true,
    'Foster Care License',
    '[{"label":"Foster Care","any_of":["foster care","child placing","child placement","dhhs","office of licensing"]}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Child Placing / Foster Care License (DHHS/OL) — PPS');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'DSPD New Caregiver Compensation Training — CMP/CMS',
    NULL, 'SOW §32.5 — CMP/CMS Qualifications', 'one_time', '{"days_after_hire": 0}'::jsonb,
    ARRAY[7, 3], 'upload_and_attestation',
    'I confirm I have completed the DSPD New Caregiver Compensation training and passed with a score of 80% or higher (effective 7/1/26).',
    true, 'any_assigned', 'staff', ARRAY['CMP', 'CMS'], true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'DSPD New Caregiver Compensation Training — CMP/CMS');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assigned_to_groups, assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Driving Record — On File (Transporting Staff)',
    'Any staff member who transports Persons must have a current driving record on file, renewed annually. Also requires current valid driver''s license and current auto insurance on file.',
    'SOW §1.30 — Transportation Requirements', 'annually', '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14], 'upload', true, ARRAY[v_all_staff_group_id], 'any_assigned', 'staff', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Driving Record — On File (Transporting Staff)');

  -- ══════════════ STAFF-PER-CLIENT OBLIGATIONS (scope = 'staff_per_client') ═══

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
    assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Client-Specific Training — [Client Name]',
    'Each staff member must complete client-specific training for every Person they are assigned to serve, within 30 days of assignment. Per SOW §1.8(4)(O), training must cover: (i) the Person''s disability, interests, goals, and support needs; (ii) relevant medical and safety information; (iii) applicable portions of the PCSP, BSP, Support Strategies, IEP, Employment Plan, suicide prevention safety plan, and emergency protocols; (iv) staff responsibilities and when to seek supervisor support; (v) DNR/POLST protocols if applicable; (vi) palliative and hospice protocols if applicable. Make sure Support Strategies are published before marking this training complete.',
    'SOW §1.8(4)(O) — Person-Specific Training', 'one_time', '{"days_after_assignment": 30}'::jsonb,
    ARRAY[14, 7, 3], 'form', true, 'any_assigned', 'staff_per_client', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Client-Specific Training — [Client Name]');

  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text, requires_individual_completion,
    assignee_role, scope, target_service_codes,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
  )
  SELECT v_org_id,
    'Support Strategies — [Client Name]',
    'Support Strategies must be developed for each Person''s PCSP goals and submitted to the Support Coordinator within 30 days of PCSP activation. The BSP serves as the Support Strategy for Behavior Consultation clients. The Medical Care Plan serves as the Support Strategy for Professional Nursing Services clients. Log a new event each time a client''s PCSP is activated or renewed. Support Strategies must be completed before staff can be fully trained on the client''s plan — the Client-Specific Training obligation covers PCSP content including Support Strategies per SOW §1.8(4)(O)(iii).',
    'SOW §1.24(5) — Person Centered Planning', 'per_event', '{"days_after_trigger": 30}'::jsonb,
    ARRAY[14, 7, 3], 'upload_and_attestation',
    'I confirm Support Strategies have been developed for all of this client''s PCSP goals, reviewed for accuracy, and submitted to the Support Coordinator within 30 days of PCSP activation.',
    false, 'any_assigned', 'staff_per_client', ARRAY[]::text[],
    true, true, true, 'sow', true
  WHERE NOT EXISTS (SELECT 1 FROM public.company_obligations WHERE organization_id = v_org_id AND title = 'Support Strategies — [Client Name]');

END $$;
