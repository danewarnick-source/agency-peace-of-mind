
ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS discovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS people_involved text,
  ADD COLUMN IF NOT EXISTS injuries text,
  ADD COLUMN IF NOT EXISTS medical_attention text,
  ADD COLUMN IF NOT EXISTS is_abuse_neglect boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prevention_strategies text,
  ADD COLUMN IF NOT EXISTS is_fatality boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardian_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS guardian_notified_method text,
  ADD COLUMN IF NOT EXISTS guardian_notified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS upi_initiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS upi_initiated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS upi_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS upi_completed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS followup_notes text;

CREATE INDEX IF NOT EXISTS idx_incident_reports_org_status_disc
  ON public.incident_reports (organization_id, status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_reports_client_disc
  ON public.incident_reports (client_id, discovered_at DESC);
