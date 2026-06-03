-- 1) Widen status enum to add 'held'
ALTER TABLE public.emar_logs DROP CONSTRAINT IF EXISTS emar_logs_status_check;
ALTER TABLE public.emar_logs ADD CONSTRAINT emar_logs_status_check
  CHECK (status IN ('administered','refused','omitted','missed','held'));

-- 2) Add HHS-preserving columns + recorded_in
ALTER TABLE public.emar_logs
  ADD COLUMN IF NOT EXISTS provider_id uuid NULL,
  ADD COLUMN IF NOT EXISTS variance_note text NULL,
  ADD COLUMN IF NOT EXISTS attestation_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recorded_in text NOT NULL DEFAULT 'dsi'
    CHECK (recorded_in IN ('dsi','hhs','general'));

-- 3) Backfill existing rows (all 3 came from DSI/workspace/general eMAR pass)
UPDATE public.emar_logs SET recorded_in = 'dsi' WHERE recorded_in IS NULL OR recorded_in = 'dsi';

-- Helpful index for cross-hub dedupe ("is this dose already recorded?")
CREATE INDEX IF NOT EXISTS idx_emar_logs_dose_lookup
  ON public.emar_logs (client_id, medication_id, scheduled_for);

-- 4) Retire HHS-only table (empty, kept as safety margin)
ALTER TABLE IF EXISTS public.hhs_emar_logs RENAME TO hhs_emar_logs_deprecated;