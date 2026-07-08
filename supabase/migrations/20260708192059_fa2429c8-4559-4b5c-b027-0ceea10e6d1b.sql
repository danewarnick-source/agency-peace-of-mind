
DO $$
DECLARE
  v_org uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
BEGIN

-- ---------------------------------------------------------------
-- 1) Insert 17 new SOW §1.8 training requirement rows
-- ---------------------------------------------------------------
INSERT INTO public.nectar_requirements
  (organization_id, requirement_key, title, description, category,
   source_citation, obligation_category, approval_state, activation_state,
   metadata)
VALUES
  (v_org, 'staff_train_hipaa',
   'Complete HIPAA and confidentiality training',
   'Staff complete HIPAA / confidentiality training before working with Persons.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_communicable_disease',
   'Complete communicable diseases training',
   'Staff complete communicable-disease prevention and universal-precautions training.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_seizure_orientation',
   'Complete seizure disorder orientation',
   'Staff complete seizure disorder orientation, including response to previously unknown seizures.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_choking_heimlich',
   'Complete choking prevention and Heimlich maneuver training',
   'Staff complete choking-prevention and Heimlich-maneuver response training.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_emergency_escalation',
   'Complete emergency escalation training (911 / medical / mental-health professional)',
   'Staff complete training on when to call 911, a medical professional, or a mental-health professional.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_incident_reporting',
   'Complete incident reporting training',
   'Staff complete training on incident identification, documentation, and reporting timelines.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_legal_rights_ada',
   'Complete legal rights of Persons and ADA training',
   'Staff complete training on the legal rights of Persons served and the Americans with Disabilities Act.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_abuse_neglect_exploitation',
   'Complete abuse, neglect & exploitation prevention and reporting training',
   'Staff complete training on preventing abuse, neglect, and exploitation and on reporting to protective services and law enforcement.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_positive_behavior_supports_r539_4',
   'Complete Positive Behavior Supports as first response training (R539-4)',
   'Staff complete training on positive behavior supports as the first response, per Utah Admin Code R539-4.',
   'obligation', 'SOW 2026 — Section 1.8; Utah Admin Code R539-4', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_dspd_philosophy',
   'Complete DSPD philosophy, mission, and beliefs training',
   'Staff complete DSPD philosophy, mission, and core-beliefs orientation.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_hcbs_settings_rule',
   'Complete HCBS Settings Rule training',
   'Staff complete training on the HCBS Settings Rule and its practical application in service settings.',
   'obligation', 'SOW 2026 — Section 1.8; 42 CFR 441.301', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_crisis_deescalation',
   'Complete crisis de-escalation strategies training',
   'Staff complete training on non-physical crisis de-escalation strategies.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_trauma_informed_care',
   'Complete trauma-informed care training',
   'Staff complete trauma-informed care principles and practice training.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_suicide_prevention',
   'Complete suicide prevention training',
   'Staff complete suicide prevention / awareness / safety-plan training.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_oig_fwa_reporting',
   'Complete OIG fraud, waste, and abuse reporting training',
   'Staff complete training on identifying and reporting fraud, waste, and abuse to the OIG. Distinct from the OIG exclusion check performed at hire.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')),

  (v_org, 'staff_train_dnr_polst_palliative',
   'Complete DNR / POLST / palliative / hospice protocols training',
   'Staff complete training on DNR, POLST, palliative, and hospice protocols. Conditionally applicable — required only for Staff supporting Persons with such orders in place.',
   'obligation', 'SOW 2026 — Section 1.8; SOW 2026 — Section 1.10(14)', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days','conditionally_applicable',true)),

  (v_org, 'staff_train_person_specific',
   'Complete Person-specific training before working with the Person',
   'Staff complete Person-specific training covering the Person''s disability, interests, goals, and support needs; relevant medical, health, and safety information; and applicable portions of the Person''s PCSP, BSP, IEP, employment plan, and suicide-prevention safety plan.',
   'obligation', 'SOW 2026 — Section 1.8', 'staff',
   'provider_confirmed', 'active',
   jsonb_build_object('scope','hr_staff_checklist','phase','upon_hire'));

-- ---------------------------------------------------------------
-- 2) Re-scope existing Medicaid 101 row into the HR checklist
-- ---------------------------------------------------------------
UPDATE public.nectar_requirements
SET approval_state = 'provider_confirmed',
    metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object('scope','hr_staff_checklist','phase','within_30_days')
WHERE id = '6840afd5-9cac-4453-aded-f65c43b8d9d8';

-- ---------------------------------------------------------------
-- 3) Add phase metadata to the 21 pass-1 HR checklist rows
-- ---------------------------------------------------------------

-- upon_hire
UPDATE public.nectar_requirements
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('phase','upon_hire')
WHERE id IN (
  'a2a68349-e98a-488d-a42e-b574ea7b4880', -- tax/ID docs
  '860f403c-12ea-4b5a-b945-f7ae0475ee86', -- BCI form
  'e8ebc6df-adef-4e27-9c36-b0e8c4570bad', -- DACS
  '180a9df2-99d2-4d91-b5d3-8c3ca35c19e4', -- E-Verify
  'dafca597-c245-459a-acd9-847eca181cbf', -- OIG exclusion
  'aacedee9-0914-46f0-aa5d-52e95356c5cb', -- NEIF
  '3cdb2270-54fd-48e4-8666-68ea6c6b138e', -- GDrive
  '14f4cc7f-7e88-4a16-a4d0-e4510cd563c0', -- DSP training cert
  'ab933f19-4d8f-4fe5-a1e7-b3e7f7f0632f', -- FH Permit
  '56942dbd-5d1c-4cb4-b07c-e398427730cc', -- HHS training cert
  'cf4cac6b-c2b1-4416-8d40-dc44f07bfaac', -- QuickBooks / DWS
  '076af0c0-1d13-41af-8413-141361b36158', -- Vehicle / insurance
  '01a7e412-bd7e-4526-893c-4fd8aa5803b9'  -- ABI before working alone
);

-- within_30_days
UPDATE public.nectar_requirements
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('phase','within_30_days')
WHERE id IN (
  '7f23fd32-e5f9-4190-add5-2f8cf8587782', -- Behavior Training
  '1404ebf5-40ac-46f9-99e5-eb9be29374d3', -- Medicaid Disclosure
  '57bfacb6-5c33-4b68-bd4c-d3dabcb37354', -- Person Centered
  '0a5bcfc8-cd10-4f31-b476-707ca3c20c9a', -- CPR/First Aid (MSLC 30-day column)
  '04b74162-9938-473e-86d3-2bfe563e26e5'  -- Orientation within 30 days
);

-- within_180_days
UPDATE public.nectar_requirements
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('phase','within_180_days')
WHERE id = '045a9a9c-22f7-4f3d-92d2-5106fccb3efe'; -- aggressive-behavior intervention

-- annual
UPDATE public.nectar_requirements
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('phase','annual')
WHERE id = 'cce9a5f1-62fa-4891-ab87-1d6ff9bf00ca'; -- 12-hour annual

-- evaluation
UPDATE public.nectar_requirements
SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('phase','evaluation')
WHERE id = 'a914c07e-e30f-45e4-bb07-583d1003ca92'; -- 30/6/12-month evals

END $$;
