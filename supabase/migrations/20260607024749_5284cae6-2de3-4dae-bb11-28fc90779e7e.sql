
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS assigned_clients uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS all_clients boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_forms_assigned_clients ON public.forms USING gin (assigned_clients);

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_subs_client ON public.form_submissions (client_id, submitted_at DESC);
