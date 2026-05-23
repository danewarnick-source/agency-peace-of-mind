
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS physical_address text,
  ADD COLUMN IF NOT EXISTS home_latitude numeric,
  ADD COLUMN IF NOT EXISTS home_longitude numeric,
  ADD COLUMN IF NOT EXISTS pcsp_goals text[] NOT NULL DEFAULT '{}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_notes_shift_id_unique'
  ) THEN
    ALTER TABLE public.shift_notes ADD CONSTRAINT shift_notes_shift_id_unique UNIQUE (shift_id);
  END IF;
END $$;

ALTER TYPE public.shift_status ADD VALUE IF NOT EXISTS 'pending_approval';
