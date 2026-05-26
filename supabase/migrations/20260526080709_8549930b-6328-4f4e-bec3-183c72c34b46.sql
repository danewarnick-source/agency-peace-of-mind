
ALTER TABLE public.hhs_incident_reports
  ADD COLUMN IF NOT EXISTS incident_address text,
  ADD COLUMN IF NOT EXISTS individuals_involved jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS incident_type_other text,
  ADD COLUMN IF NOT EXISTS guardian_notified boolean,
  ADD COLUMN IF NOT EXISTS narrative_before text,
  ADD COLUMN IF NOT EXISTS narrative_during text,
  ADD COLUMN IF NOT EXISTS narrative_after text;

ALTER TABLE public.hhs_emar_logs
  ADD COLUMN IF NOT EXISTS variance_note text,
  ADD COLUMN IF NOT EXISTS is_medication_error boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attestation_signed boolean NOT NULL DEFAULT false;
