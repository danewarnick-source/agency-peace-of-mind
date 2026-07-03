-- Prompt 36: Backfill nectar_requirements.service_code from nectar_requirement_mappings
-- Idempotent, additive, data-only (plus one nullable helper column).

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
    -- Real DSPD codes: uppercase letter/digit tokens (2-8 chars, starts w/ letter)
    AND TRIM(m.scope_value) ~ '^[A-Za-z][A-Za-z0-9]{1,7}$'
  GROUP BY m.requirement_id
)
UPDATE public.nectar_requirements r
SET
  service_code = CASE
    WHEN array_length(ca.codes, 1) = 1 THEN ca.codes[1]
    ELSE r.service_code  -- leave NULL when multiple distinct codes
  END,
  service_codes_all = CASE
    WHEN array_length(ca.codes, 1) > 1 THEN ca.codes
    ELSE r.service_codes_all
  END
FROM code_aggregates ca
WHERE r.id = ca.requirement_id
  AND r.service_code IS NULL;
