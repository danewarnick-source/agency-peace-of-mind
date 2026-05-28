ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS denial_reason  TEXT,
  ADD COLUMN IF NOT EXISTS denied_by      UUID,
  ADD COLUMN IF NOT EXISTS denied_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_staff_rejected
  ON public.evv_timesheets (staff_id, status)
  WHERE status = 'Rejected';

CREATE INDEX IF NOT EXISTS idx_daily_logs_user_rejected
  ON public.daily_logs (user_id, status)
  WHERE status = 'rejected';

CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date
  ON public.daily_logs (user_id, log_date DESC)
  WHERE status != 'rejected';