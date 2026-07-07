ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS staff_attested_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_attested_by uuid,
  ADD COLUMN IF NOT EXISTS attested_on_behalf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attested_on_behalf_by uuid,
  ADD COLUMN IF NOT EXISTS attested_on_behalf_reason text,
  ADD COLUMN IF NOT EXISTS attested_on_behalf_of_staff_id uuid;

CREATE INDEX IF NOT EXISTS idx_daily_logs_pending_hist_attest
  ON public.daily_logs (user_id, status)
  WHERE import_source = 'historical_import' AND status = 'pending_staff_attestation';

CREATE INDEX IF NOT EXISTS idx_daily_logs_pending_hist_org
  ON public.daily_logs (organization_id, status)
  WHERE import_source = 'historical_import' AND status = 'pending_staff_attestation';