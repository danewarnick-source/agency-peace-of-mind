
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS origin TEXT NULL DEFAULT 'internal_training',
  ADD COLUMN IF NOT EXISTS requirement_id UUID NULL REFERENCES public.nectar_requirements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certification_type_code TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certifications_origin_check'
  ) THEN
    ALTER TABLE public.certifications
      ADD CONSTRAINT certifications_origin_check
      CHECK (origin IN ('internal_training','uploaded','manual','imported'));
  END IF;
END $$;

UPDATE public.certifications
   SET origin = CASE WHEN course_id IS NOT NULL THEN 'internal_training' ELSE 'manual' END
 WHERE origin IS NULL;

CREATE INDEX IF NOT EXISTS idx_cert_req
  ON public.certifications (organization_id, requirement_id);
