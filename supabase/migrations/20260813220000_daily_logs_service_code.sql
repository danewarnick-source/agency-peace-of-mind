-- RP5 (Exceptional Care Respite With Room and Board) reuses the HHS daily
-- summary note model. daily_logs previously had no way to distinguish which
-- service code a note bills against, since every existing row was HHS.
-- Adding a nullable service_code column, backfilled to 'HHS' for existing
-- rows, keeps HHS billing attribution unchanged and lets new RP5 rows be
-- correctly identified.
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS service_code text;
UPDATE public.daily_logs SET service_code = 'HHS' WHERE service_code IS NULL;
ALTER TABLE public.daily_logs ALTER COLUMN service_code SET DEFAULT 'HHS';
