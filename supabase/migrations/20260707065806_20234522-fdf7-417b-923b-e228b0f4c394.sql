ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS import_job_id uuid;

CREATE INDEX IF NOT EXISTS idx_daily_logs_import_source
  ON public.daily_logs (organization_id, import_source)
  WHERE import_source IS NOT NULL;