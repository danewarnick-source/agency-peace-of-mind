-- Migration for SJD product prompts 11-17.
--
-- 1) Widen upi_attestations.kind to add SJD's employment-monthly and
--    support-strategies attestation flavors (mirrors SEI, prompt 14) plus
--    the SJD USOR Outreach Verification flavor (prompt 17). Also add a
--    nullable note_text column so the USOR Outreach entry can carry its
--    short free-text note (whether the Person received USOR outreach that
--    month + current funding status) alongside the existing attestation
--    timestamp/staff-name columns — reusing the generic attestation store
--    rather than a new table.
ALTER TABLE public.upi_attestations DROP CONSTRAINT IF EXISTS upi_attestations_kind_check;
ALTER TABLE public.upi_attestations ADD CONSTRAINT upi_attestations_kind_check
  CHECK (kind IN (
    'sei_employment_monthly', 'sei_support_strategies',
    'usor_vendor', 'usor_vendor_job_development',
    'sjd_employment_monthly', 'sjd_support_strategies', 'sjd_usor_outreach'
  ));

ALTER TABLE public.upi_attestations ADD COLUMN IF NOT EXISTS note_text text;

-- 2) SJD Assessment Documentation selection (prompt 15) — per-client toggle
-- between "Discovery Process" and "Vocational Assessment", plus the
-- admin-entered assessment start date used only by the Vocational
-- Assessment deadline (Discovery Process derives its deadline from the SJD
-- service start date already on client_billing_codes — no column needed
-- for that branch). One row per (organization_id, client_id).
CREATE TABLE IF NOT EXISTS public.sjd_assessment_selections (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id              uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assessment_type        text NOT NULL DEFAULT 'discovery_process'
                            CHECK (assessment_type IN ('discovery_process', 'vocational_assessment')),
  assessment_start_date  date,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid,
  updated_by_name        text,
  UNIQUE (organization_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sjd_assessment_selections TO authenticated;
GRANT ALL ON public.sjd_assessment_selections TO service_role;

ALTER TABLE public.sjd_assessment_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read sjd assessment selections"
  ON public.sjd_assessment_selections FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage sjd assessment selections"
  ON public.sjd_assessment_selections FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sjd_assessment_selections_org_client
  ON public.sjd_assessment_selections (organization_id, client_id);
