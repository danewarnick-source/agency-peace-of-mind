ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS nectar_review_service_code text;
