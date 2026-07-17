ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS historical_attestation_text text,
  ADD COLUMN IF NOT EXISTS historical_attestation_version text;