ALTER TABLE public.extracted_fields
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_by uuid;
CREATE INDEX IF NOT EXISTS idx_extracted_fields_active
  ON public.extracted_fields (import_subject_id)
  WHERE dismissed_at IS NULL;