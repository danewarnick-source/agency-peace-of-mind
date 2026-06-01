
ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'needs_attention';

ALTER TABLE public.nectar_requirements
  DROP CONSTRAINT IF EXISTS nectar_requirements_review_status_chk;
ALTER TABLE public.nectar_requirements
  ADD CONSTRAINT nectar_requirements_review_status_chk
  CHECK (review_status IN ('needs_attention','confirmed','removed'));

-- Backfill: previously-verified rows are confirmed; manual entries default confirmed too.
UPDATE public.nectar_requirements
   SET review_status = 'confirmed'
 WHERE verified = true AND review_status = 'needs_attention';

UPDATE public.nectar_requirements
   SET review_status = 'confirmed'
 WHERE origin = 'manual' AND review_status = 'needs_attention';

CREATE INDEX IF NOT EXISTS idx_nectar_requirements_review_status
  ON public.nectar_requirements (organization_id, review_status);
