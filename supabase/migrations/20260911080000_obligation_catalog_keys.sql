-- Additive catalog keys / disposition / pack version (Compliance revamp Step 1).
-- Idempotent. Do NOT drop or truncate. Do NOT run against production from CI —
-- Dane reviews this in the PR, then pastes it into Lovable's SQL editor
-- (clear the editor first). See docs/SQL_HANDOFF.md.
--
-- No RLS in this file. Soft Core must enable RLS on pack_changelog before
-- live apply (one change). Nightly pack-apply cron is Step 2 — not wired here.

-- ── company_obligations identity ──────────────────────────────────────────
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS key text;

ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS disposition text;

-- company_obligations.source already exists (sow | provider). Do not add it
-- again. Backfill sets unmatched titles to source=provider.

CREATE INDEX IF NOT EXISTS company_obligations_org_key_idx
  ON public.company_obligations (organization_id, key);

-- ── instance jurisdiction ─────────────────────────────────────────────────
ALTER TABLE public.company_obligation_instances
  ADD COLUMN IF NOT EXISTS state_code text;

-- ── org pack pointer ──────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS applied_pack_version text;

-- ── pack changelog (global; no RLS this PR) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.pack_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  pack_version text NOT NULL,
  obligation_key text NOT NULL,
  change_kind text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (state_code, pack_version, obligation_key, change_kind)
);

GRANT SELECT ON public.pack_changelog TO authenticated;
GRANT ALL ON public.pack_changelog TO service_role;

INSERT INTO public.pack_changelog (state_code, pack_version, obligation_key, change_kind)
VALUES
  ('UT', 'UT-2026.07', 'orientation_30_day', 'added'),
  ('UT', 'UT-2026.07', 'ce_12h_annual', 'added'),
  ('UT', 'UT-2026.07', 'cpr_first_aid_initial', 'added'),
  ('UT', 'UT-2026.07', 'cpr_first_aid_renewal', 'added'),
  ('UT', 'UT-2026.07', 'pct_hire_practices', 'added'),
  ('UT', 'UT-2026.07', 'behavior_intervention_cert', 'added'),
  ('UT', 'UT-2026.07', 'acre_sei', 'added'),
  ('UT', 'UT-2026.07', 'acre_sed', 'added'),
  ('UT', 'UT-2026.07', 'acre_sjd', 'added'),
  ('UT', 'UT-2026.07', 'customized_employment_usu', 'added'),
  ('UT', 'UT-2026.07', 'sei_ssi_benefits', 'added'),
  ('UT', 'UT-2026.07', 'hsq_safe_environment', 'added'),
  ('UT', 'UT-2026.07', 'cmp_cms_caregiver_comp', 'added'),
  ('UT', 'UT-2026.07', 'background_screening_annual', 'added'),
  ('UT', 'UT-2026.07', 'medicaid_exclusion_annual', 'added'),
  ('UT', 'UT-2026.07', 'medicaid_disclosure_annual', 'added'),
  ('UT', 'UT-2026.07', 'educational_credentials', 'added'),
  ('UT', 'UT-2026.07', 'training_file_maintained', 'added'),
  ('UT', 'UT-2026.07', 'driving_record_transport', 'added'),
  ('UT', 'UT-2026.07', 'pps_foster_license', 'added'),
  ('UT', 'UT-2026.07', 'ol_rhs_license_4plus', 'added'),
  ('UT', 'UT-2026.07', 'ol_rhs_cert_3or_fewer', 'added'),
  ('UT', 'UT-2026.07', 'ol_day_tx_license_4plus', 'added'),
  ('UT', 'UT-2026.07', 'ol_day_support_cert_3or_fewer', 'added'),
  ('UT', 'UT-2026.07', 'usor_job_coaching_sei', 'added'),
  ('UT', 'UT-2026.07', 'usor_job_development_sjd', 'added'),
  ('UT', 'UT-2026.07', 'zoning_life_safety', 'added'),
  ('UT', 'UT-2026.07', 'hhs_annual_outcome', 'added'),
  ('UT', 'UT-2026.07', 'sei_monthly_summary_upi', 'added'),
  ('UT', 'UT-2026.07', 'sei_employment_data_upi', 'added'),
  ('UT', 'UT-2026.07', 'sei_employment_strategies_upi', 'added'),
  ('UT', 'UT-2026.07', 'sjd_monthly_summary_upi', 'added'),
  ('UT', 'UT-2026.07', 'sjd_employment_data_upi', 'added'),
  ('UT', 'UT-2026.07', 'sjd_usor_contact_monthly', 'added'),
  ('UT', 'UT-2026.07', 'cmp_cms_monthly_summaries', 'added'),
  ('UT', 'UT-2026.07', 'hhs_evac_drills_quarterly', 'added'),
  ('UT', 'UT-2026.07', 'rhs_evac_drills_quarterly', 'added'),
  ('UT', 'UT-2026.07', 'pps_evac_drills_quarterly', 'added'),
  ('UT', 'UT-2026.07', 'hhs_home_cert_annual', 'added'),
  ('UT', 'UT-2026.07', 'client_specific_training', 'added'),
  ('UT', 'UT-2026.07', 'support_strategies', 'added'),
  ('UT', 'UT-2026.07', 'pct_client', 'added'),
  ('UT', 'UT-2026.07', 'em_bcp_plan', 'added'),
  ('UT', 'UT-2026.07', 'em_bcp_training_annual', 'added'),
  ('UT', 'UT-2026.07', 'conflict_of_interest_process', 'added'),
  ('UT', 'UT-2026.07', 'person_discharge_process', 'added'),
  ('UT', 'UT-2026.07', 'iqmp', 'added'),
  ('UT', 'UT-2026.07', 'liability_insurance', 'added'),
  ('UT', 'UT-2026.07', 'dhhs_code_of_conduct_signed', 'added'),
  ('UT', 'UT-2026.07', 'abi_training', 'added'),
  ('UT', 'UT-2026.07', 'medicaid_101_contractor', 'added'),
  ('UT', 'UT-2026.07', 'medicaid_manuals_memo', 'added'),
  ('UT', 'UT-2026.07', 'volunteer_training_file', 'added'),
  ('UT', 'UT-2026.07', 'usteps_upi_accounts', 'added'),
  ('UT', 'UT-2026.07', 'medicaid_enrollment', 'added'),
  ('UT', 'UT-2026.07', 'medicaid_change_notifications', 'added'),
  ('UT', 'UT-2026.07', 'no_gifts_process', 'added'),
  ('UT', 'UT-2026.07', 'governing_board_records', 'added'),
  ('UT', 'UT-2026.07', 'personnel_policies', 'added'),
  ('UT', 'UT-2026.07', 'operating_policies', 'added'),
  ('UT', 'UT-2026.07', 'human_rights_plan', 'added'),
  ('UT', 'UT-2026.07', 'health_support_policies', 'added'),
  ('UT', 'UT-2026.07', 'housemate_informed_choice', 'added'),
  ('UT', 'UT-2026.07', 'dsi_annual_outcome', 'added'),
  ('UT', 'UT-2026.07', 'sei_annual_outcome', 'added'),
  ('UT', 'UT-2026.07', 'sl_annual_outcome', 'added'),
  ('UT', 'UT-2026.07', 'commerce_entity_standing', 'added'),
  ('UT', 'UT-2026.07', 'dhhs_code_of_conduct_posted', 'added'),
  ('UT', 'UT-2026.07', 'baa_on_file', 'added'),
  ('UT', 'UT-2026.07', 'large_loan_disclosure_process', 'added'),
  ('UT', 'UT-2026.07', 'incident_reporting_process', 'added'),
  ('UT', 'UT-2026.07', 'hipaa_npp', 'added'),
  ('UT', 'UT-2026.07', 'hrc_committee', 'added'),
  ('UT', 'UT-2026.07', 'epr_community_20pct', 'added'),
  ('UT', 'UT-2026.07', 'medical_dental_exams', 'added'),
  ('UT', 'UT-2026.07', 'medication_record', 'added'),
  ('UT', 'UT-2026.07', 'fba_bsp', 'added'),
  ('UT', 'UT-2026.07', 'grievance_acknowledgment', 'added'),
  ('UT', 'UT-2026.07', 'rights_restriction_record', 'added'),
  ('UT', 'UT-2026.07', 'belongings_inventory', 'added'),
  ('UT', 'UT-2026.07', 'hhs_room_board_agreement', 'added'),
  ('UT', 'UT-2026.07', 'rhs_lease_agreement', 'added'),
  ('UT', 'UT-2026.07', 'pps_room_board_agreement', 'added'),
  ('UT', 'UT-2026.07', 'pba_financial_review', 'added'),
  ('UT', 'UT-2026.07', 'emergency_loan_record', 'added'),
  ('UT', 'UT-2026.07', 'timesheets_attendance', 'added'),
  ('UT', 'UT-2026.07', 'evv_visit_verification', 'added'),
  ('UT', 'UT-2026.07', 'billing_service_match', 'added'),
  ('UT', 'UT-2026.07', 'hhs_billable_day', 'added')
ON CONFLICT (state_code, pack_version, obligation_key, change_kind) DO NOTHING;
