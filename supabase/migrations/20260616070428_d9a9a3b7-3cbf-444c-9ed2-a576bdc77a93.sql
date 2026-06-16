ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS allergies text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dysphagia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS swallowing_alerts text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS self_admin_med_support boolean NOT NULL DEFAULT false;

ALTER TABLE public.client_medications
  ADD COLUMN IF NOT EXISTS packaging text,
  ADD COLUMN IF NOT EXISTS side_effects text,
  ADD COLUMN IF NOT EXISTS contributes_to_swallowing_difficulty boolean NOT NULL DEFAULT false;