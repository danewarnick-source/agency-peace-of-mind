ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS staff_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS staff_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_flag_reason text;

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_staff_pending_hist
  ON public.evv_timesheets (staff_id, status)
  WHERE import_source = 'historical_import';