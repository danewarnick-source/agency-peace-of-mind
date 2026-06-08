ALTER TABLE public.form_submissions
  ADD COLUMN shift_id uuid REFERENCES public.evv_timesheets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_client_form_submitted
  ON public.form_submissions (client_id, form_id, submitted_at DESC);