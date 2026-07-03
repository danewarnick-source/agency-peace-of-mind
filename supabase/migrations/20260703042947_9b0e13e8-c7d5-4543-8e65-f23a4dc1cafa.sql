-- Prompt 37: Backfill nectar_requirements.service_code from ALL code mappings
-- (including unconfirmed NECTAR proposals). Idempotent, additive, data-only.

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS service_codes_all text[];

WITH code_aggregates AS (
  SELECT
    m.requirement_id,
    ARRAY_AGG(DISTINCT UPPER(TRIM(m.scope_value)) ORDER BY UPPER(TRIM(m.scope_value))) AS codes
  FROM public.nectar_requirement_mappings m
  WHERE m.scope_kind = 'code'
    AND m.scope_value IS NOT NULL
    AND TRIM(m.scope_value) <> ''
    AND LOWER(TRIM(m.scope_value)) NOT IN ('unknown', '*')
    -- confirmed flag intentionally ignored
  GROUP BY m.requirement_id
)
UPDATE public.nectar_requirements r
SET
  service_code = CASE
    WHEN array_length(ca.codes, 1) = 1 THEN ca.codes[1]
    ELSE r.service_code
  END,
  service_codes_all = CASE
    WHEN array_length(ca.codes, 1) > 1 THEN ca.codes
    ELSE r.service_codes_all
  END
FROM code_aggregates ca
WHERE r.id = ca.requirement_id
  AND r.service_code IS NULL;
