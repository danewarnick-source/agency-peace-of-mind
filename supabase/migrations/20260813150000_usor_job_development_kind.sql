-- Provider Licensing Hub: add 'usor_vendor_job_development' as a valid
-- upi_attestations.kind, for the SJD "USOR Approved Vendor — Job
-- Development" card's attestation (mirrors the existing SEI 'usor_vendor'
-- kind added in 20260813110000_prompts_16_28_batch.sql).
ALTER TABLE public.upi_attestations DROP CONSTRAINT IF EXISTS upi_attestations_kind_check;
ALTER TABLE public.upi_attestations ADD CONSTRAINT upi_attestations_kind_check
  CHECK (kind IN ('sei_employment_monthly', 'sei_support_strategies', 'usor_vendor', 'usor_vendor_job_development'));
