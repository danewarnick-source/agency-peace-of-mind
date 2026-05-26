ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS ai_compliance_status text,
  ADD COLUMN IF NOT EXISTS ai_coaching_iterations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_compliance_feedback text;