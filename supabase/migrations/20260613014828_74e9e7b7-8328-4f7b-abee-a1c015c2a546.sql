
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS incident_ai_review_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS ai_review_status text,
  ADD COLUMN IF NOT EXISTS ai_review_issues jsonb,
  ADD COLUMN IF NOT EXISTS ai_review_at timestamptz;

ALTER TABLE public.incident_reports
  DROP CONSTRAINT IF EXISTS incident_reports_ai_review_status_check;
ALTER TABLE public.incident_reports
  ADD CONSTRAINT incident_reports_ai_review_status_check
  CHECK (ai_review_status IS NULL OR ai_review_status IN ('passed','answered','skipped','disabled'));
