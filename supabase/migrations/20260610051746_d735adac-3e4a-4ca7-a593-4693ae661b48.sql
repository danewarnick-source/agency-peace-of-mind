-- 1) Teams: structured type + active flag + optional metadata
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS team_type text,
  ADD COLUMN IF NOT EXISTS active    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS color     text,
  ADD COLUMN IF NOT EXISTS capacity  integer,
  ADD COLUMN IF NOT EXISTS address   text;

-- Backfill team_type from existing setting (no blanket group_home default)
UPDATE public.teams
SET team_type = CASE
  WHEN setting IS NULL THEN 'other'
  WHEN lower(setting) LIKE '%residential%' THEN 'group_home'
  WHEN lower(setting) LIKE '%group%home%'  THEN 'group_home'
  WHEN lower(setting) LIKE '%day%'         THEN 'day_program'
  WHEN lower(setting) LIKE '%community%'   THEN 'community'
  WHEN lower(setting) LIKE '%1:1%'         THEN 'community'
  WHEN lower(setting) LIKE '%individual%'  THEN 'community'
  ELSE 'other'
END
WHERE team_type IS NULL;

-- Enforce values + NOT NULL going forward
ALTER TABLE public.teams
  ALTER COLUMN team_type SET DEFAULT 'other',
  ALTER COLUMN team_type SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.teams
    ADD CONSTRAINT teams_team_type_check
    CHECK (team_type IN ('group_home','day_program','community','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Position enum for staff-on-home designations
DO $$ BEGIN
  CREATE TYPE public.home_position AS ENUM ('manager','supervisor','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) home_staff_designations: add normalized position + active
ALTER TABLE public.home_staff_designations
  ADD COLUMN IF NOT EXISTS position public.home_position,
  ADD COLUMN IF NOT EXISTS active   boolean NOT NULL DEFAULT true;

-- Backfill position from the existing free-text label on home_designations
UPDATE public.home_staff_designations d
SET position = CASE
  WHEN lower(hd.label) LIKE '%manager%'    THEN 'manager'::public.home_position
  WHEN lower(hd.label) LIKE '%supervisor%' THEN 'supervisor'::public.home_position
  ELSE 'staff'::public.home_position
END
FROM public.home_designations hd
WHERE d.designation_id = hd.id
  AND d.position IS NULL;

-- Default + NOT NULL after backfill
ALTER TABLE public.home_staff_designations
  ALTER COLUMN position SET DEFAULT 'staff',
  ALTER COLUMN position SET NOT NULL;

-- Helpful index for the "managers of a home" lookup used by the site header
CREATE INDEX IF NOT EXISTS idx_hsd_team_position
  ON public.home_staff_designations (team_id, position) WHERE active = true;

-- Existing RLS policies on public.teams and public.home_staff_designations
-- already cover these new columns (org-members read, org admins/managers write).
-- No GRANT changes needed: both tables already have the correct grants from prior migrations.