-- Seed the six baseline Company Obligations mandated by DHHS91172 for all
-- staff, and add the NECTAR-validation columns those (and future upload-
-- evidence obligations) need on the definition row. The completions-side
-- validation columns are added in a later migration alongside the actual
-- NECTAR OCR integration.
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS nectar_cert_type_label text,
  ADD COLUMN IF NOT EXISTS nectar_keyword_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Per-person instance tracking: obligations targeted at a group (e.g. "All
-- Staff") generate ONE instance per assignee for the days_after_hire /
-- anniversary_based cadence shapes below (each staffer has their own due
-- date, derived from their own hire_date), rather than one shared instance
-- for the whole group. Nullable — existing shared instances leave this null.
ALTER TABLE public.company_obligation_instances
  ADD COLUMN IF NOT EXISTS assignee_staff_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_assignee_staff
  ON public.company_obligation_instances(assignee_staff_id);

-- A per-person instance is unique per (obligation, assignee, period); the
-- existing UNIQUE (obligation_id, period_key) constraint can't express that
-- since multiple staff share the "Due <date>" period_key text under a
-- per-person obligation, so replace it with a partial index scheme:
-- non-per-person instances keep uniqueness on (obligation_id, period_key);
-- per-person ones are unique on (obligation_id, period_key, assignee_staff_id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_obligation_instances_obligation_id_period_key_key'
  ) THEN
    ALTER TABLE public.company_obligation_instances
      DROP CONSTRAINT company_obligation_instances_obligation_id_period_key_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_shared_period
  ON public.company_obligation_instances(obligation_id, period_key)
  WHERE assignee_staff_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_person_period
  ON public.company_obligation_instances(obligation_id, period_key, assignee_staff_id)
  WHERE assignee_staff_id IS NOT NULL;

-- ── Seed the six SOW-mandated obligations for True North Supports ──────────
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

  -- 1. 30-day new-hire orientation training
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    '30-Day New Hire Orientation Training',
    'DHHS91172 requires every new direct-service staff member to complete orientation training — HIPAA, abuse/neglect/exploitation reporting, person rights, HCBS settings rule, and emergency procedures — within 30 days of their hire date.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'one_time',
    '{"days_after_hire": 30}'::jsonb,
    ARRAY[14, 7, 3, 0],
    'upload_and_attestation',
    'I attest that I have completed the required 30-day new hire orientation training covering HIPAA, abuse/neglect/exploitation reporting, participant rights, the HCBS settings rule, and emergency procedures.',
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    '30-Day New Hire Training Certificate',
    '[{"label":"HIPAA","any_of":["hipaa","privacy","confidentiality"]},{"label":"Abuse/Neglect/Exploitation","any_of":["abuse","neglect","exploitation","mandatory reporter"]},{"label":"Participant Rights","any_of":["rights","person-centered","self-determination"]},{"label":"HCBS Settings Rule","any_of":["hcbs","settings rule"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = '30-Day New Hire Orientation Training'
  );

  -- 2. Annual 12-hour continuing education
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'Annual 12-Hour Continuing Education',
    'Direct-service staff must complete 12 hours of DSPD-approved continuing education each year, starting the year after hire.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'annually',
    '{"anniversary_based": true, "start_year": 2}'::jsonb,
    ARRAY[30, 14, 0],
    'upload_and_attestation',
    'I attest that I have completed at least 12 hours of DSPD-approved continuing education for this anniversary year.',
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'Annual Continuing Education Certificate (12 hours)',
    '[{"label":"Continuing Education","any_of":["continuing education","ce hours","training hours","annual training"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'Annual 12-Hour Continuing Education'
  );

  -- 3. CPR/First Aid — initial certification
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'CPR/First Aid Certification — Initial',
    'Direct-service staff must hold a current CPR/First Aid certification within 30 days of hire.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'one_time',
    '{"days_after_hire": 30}'::jsonb,
    ARRAY[14, 7, 3, 0],
    'upload',
    NULL,
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'CPR/First Aid Certification',
    '[{"label":"CPR","any_of":["cpr","cardiopulmonary resuscitation"]},{"label":"First Aid","any_of":["first aid"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'CPR/First Aid Certification — Initial'
  );

  -- 4. CPR/First Aid — renewal
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'CPR/First Aid Certification — Renewal',
    'CPR/First Aid certification must stay current — renew before it expires. A passing NECTAR-verified upload schedules the next renewal from the certificate''s own expiration date.',
    'DHHS91172 SOW §1.9 — Staff Training Requirements',
    'annually',
    '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14, 0],
    'upload',
    NULL,
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'CPR/First Aid Certification',
    '[{"label":"CPR","any_of":["cpr","cardiopulmonary resuscitation"]},{"label":"First Aid","any_of":["first aid"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'CPR/First Aid Certification — Renewal'
  );

  -- 5. Background screening — annual
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'Background Screening — Annual',
    'Direct-service staff must have a current background screening clearance on file, re-verified annually from hire date.',
    'DHHS91172 SOW §1.10 — Background Screening',
    'annually',
    '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14, 0],
    'upload',
    NULL,
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'Background Screening Clearance',
    '[{"label":"Background Screening","any_of":["background check","background screening","criminal history","bci"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'Background Screening — Annual'
  );

  -- 6. Medicaid fraud & abuse exclusion screening — annual
  INSERT INTO public.company_obligations (
    organization_id, title, description, source_policy_section, cadence,
    due_day_config, reminder_days_before, evidence_type, attestation_text,
    requires_individual_completion, assigned_to_groups, assignee_role,
    notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked,
    nectar_cert_type_label, nectar_keyword_groups
  )
  SELECT
    v_org_id,
    'Medicaid Fraud & Abuse Exclusion Screening — Annual',
    'Staff must be screened annually against the OIG/Medicaid exclusion lists per OIG FWA reporting requirements.',
    'DHHS91172 SOW §1.11 — Program Integrity',
    'annually',
    '{"anniversary_based": true, "start_year": 1}'::jsonb,
    ARRAY[30, 14, 0],
    'upload_and_attestation',
    'I attest that this staff member has been screened against the OIG and Medicaid exclusion lists for the current period with no exclusions found.',
    true,
    ARRAY[v_all_staff_group_id],
    'any_assigned',
    true, true, true, 'sow', true,
    'OIG/Medicaid Exclusion Screening Confirmation',
    '[{"label":"Exclusion Screening","any_of":["exclusion","oig","leie","medicaid exclusion","sam.gov"]}]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_obligations
    WHERE organization_id = v_org_id AND title = 'Medicaid Fraud & Abuse Exclusion Screening — Annual'
  );
END $$;
