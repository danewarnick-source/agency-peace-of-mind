-- Part 2: per-staff types + mapping confirmation tracking.
-- profiles.staff_type_keys: array of staff_types.key the staffer belongs to (UNION applicability).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_type_keys text[] NOT NULL DEFAULT '{}'::text[];

-- Allow editing the staff_types list (rename label/description). Already covered by existing RLS.
-- No new tables needed; mapping per requirement is stored in nectar_requirements.metadata
-- (applies_to_staff_types, applies_to_confirmed_at, applies_to_confirmed_by) and was added in Part 1.

-- Add a helpful index for lookups.
CREATE INDEX IF NOT EXISTS profiles_staff_type_keys_idx ON public.profiles USING gin (staff_type_keys);