ALTER TABLE public.staff_baseline_training_completions
  ADD COLUMN IF NOT EXISTS nectar_validation_status text,
  ADD COLUMN IF NOT EXISTS nectar_validation_reasons jsonb,
  ADD COLUMN IF NOT EXISTS nectar_extracted_cert_type text,
  ADD COLUMN IF NOT EXISTS nectar_extracted_completed_date date,
  ADD COLUMN IF NOT EXISTS nectar_extracted_summary text;