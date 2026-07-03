ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS service_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS scope_level TEXT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS satisfied_by TEXT NULL DEFAULT 'unbound';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nectar_requirements_scope_level_check'
  ) THEN
    ALTER TABLE public.nectar_requirements
      ADD CONSTRAINT nectar_requirements_scope_level_check
      CHECK (scope_level IS NULL OR scope_level IN ('provider','code','role','client'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nectar_requirements_satisfied_by_check'
  ) THEN
    ALTER TABLE public.nectar_requirements
      ADD CONSTRAINT nectar_requirements_satisfied_by_check
      CHECK (satisfied_by IS NULL OR satisfied_by IN ('auto','form','credential','training','upload','attestation','unbound'));
  END IF;
END $$;

-- Backfill service_code from parenthesised codes in source_citation.
-- Match tokens of 2-6 uppercase letters/digits inside parentheses; take the first.
UPDATE public.nectar_requirements
SET service_code = sub.code
FROM (
  SELECT id,
         (regexp_match(source_citation, '\(([A-Z0-9]{2,6})(?:[^)]*)\)'))[1] AS code
  FROM public.nectar_requirements
  WHERE service_code IS NULL
    AND source_citation IS NOT NULL
) sub
WHERE public.nectar_requirements.id = sub.id
  AND sub.code IS NOT NULL
  AND public.nectar_requirements.service_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_nectar_req_service_code
  ON public.nectar_requirements (organization_id, service_code);