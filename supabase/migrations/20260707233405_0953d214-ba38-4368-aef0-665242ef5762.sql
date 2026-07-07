
-- ── client_meals: full macro model + estimate provenance ────────────────────
ALTER TABLE public.client_meals
  ADD COLUMN IF NOT EXISTS calories       numeric,
  ADD COLUMN IF NOT EXISTS protein_g      numeric,
  ADD COLUMN IF NOT EXISTS carbs_g        numeric,
  ADD COLUMN IF NOT EXISTS fat_g          numeric,
  ADD COLUMN IF NOT EXISTS extra_value    numeric,
  ADD COLUMN IF NOT EXISTS nutrition_estimated jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── client_nutrition_config: promote to full macro config ───────────────────
ALTER TABLE public.client_nutrition_config
  ADD COLUMN IF NOT EXISTS extra_label      text,
  ADD COLUMN IF NOT EXISTS extra_unit       text,
  ADD COLUMN IF NOT EXISTS use_extra_field  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calorie_target   integer,
  ADD COLUMN IF NOT EXISTS protein_target_g numeric,
  ADD COLUMN IF NOT EXISTS carbs_target_g   numeric,
  ADD COLUMN IF NOT EXISTS fat_target_g     numeric,
  ADD COLUMN IF NOT EXISTS extra_target     numeric;

-- Backfill config: the legacy single-metric slot becomes the "extra" slot
-- unless it was really fat (in which case we drop it, because fat_g is now
-- a first-class field). Never lose the label text — copy it into extra_label.
UPDATE public.client_nutrition_config
SET extra_label = COALESCE(extra_label, nutrition_label),
    extra_unit  = COALESCE(extra_unit,  nutrition_unit),
    use_extra_field =
      CASE
        WHEN nutrition_label IS NULL THEN false
        WHEN nutrition_label ILIKE '%fat%' THEN false
        ELSE true
      END
WHERE extra_label IS NULL OR extra_unit IS NULL;

-- Backfill per-meal values from the legacy nutrition_value column.
-- If the client's tracked label was fat-ish, values roll into fat_g.
-- Otherwise they roll into extra_value (blood sugar, sodium, etc.).
UPDATE public.client_meals m
SET fat_g = m.nutrition_value
FROM public.client_meal_plans p
LEFT JOIN public.client_nutrition_config c ON c.client_id = p.client_id
WHERE m.meal_plan_id = p.id
  AND m.nutrition_value IS NOT NULL
  AND m.fat_g IS NULL
  AND (c.nutrition_label IS NULL OR c.nutrition_label ILIKE '%fat%');

UPDATE public.client_meals m
SET extra_value = m.nutrition_value
FROM public.client_meal_plans p
JOIN public.client_nutrition_config c ON c.client_id = p.client_id
WHERE m.meal_plan_id = p.id
  AND m.nutrition_value IS NOT NULL
  AND m.extra_value IS NULL
  AND c.nutrition_label IS NOT NULL
  AND c.nutrition_label NOT ILIKE '%fat%';
