-- Action Required queue: speed flagged-note and missing-attestation scans
-- used by Compliance → Action Required (and the sidebar badge count).

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_org_ai_created
  ON public.evv_timesheets (organization_id, ai_compliance_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_org_missing_attest
  ON public.evv_timesheets (organization_id, created_at DESC)
  WHERE attested_at IS NULL AND clock_out_timestamp IS NOT NULL;
