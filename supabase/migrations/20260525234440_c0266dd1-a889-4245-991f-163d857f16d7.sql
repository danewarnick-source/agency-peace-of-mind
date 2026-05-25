ALTER TABLE IF EXISTS public.els_usage_ledger DROP COLUMN IF EXISTS shift_id;
DROP TABLE IF EXISTS public.shift_notes CASCADE;
DROP TABLE IF EXISTS public.shifts CASCADE;
DROP TABLE IF EXISTS public.scheduled_shifts CASCADE;
DROP FUNCTION IF EXISTS public.enforce_shift_note_on_clockout() CASCADE;
DROP TYPE IF EXISTS public.shift_status CASCADE;