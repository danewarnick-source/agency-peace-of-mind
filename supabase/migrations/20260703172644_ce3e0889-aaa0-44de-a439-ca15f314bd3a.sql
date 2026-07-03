ALTER TABLE public.hive_training_courses ADD COLUMN IF NOT EXISTS baseline_key text;

-- Backfill mapping from existing course slugs to DSPD baseline training keys.
UPDATE public.hive_training_courses SET baseline_key = 'cpr_first_aid' WHERE slug = 'cpr_first_aid' AND baseline_key IS NULL;
UPDATE public.hive_training_courses SET baseline_key = 'deescalation'  WHERE slug = 'mandt'         AND baseline_key IS NULL;
UPDATE public.hive_training_courses SET baseline_key = 'thirty_day'    WHERE slug = 'dspd_required' AND baseline_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_hive_training_courses_baseline_key ON public.hive_training_courses(baseline_key);