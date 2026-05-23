ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS job_code TEXT;

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS geofence_bypass_reason TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'shift_status' AND e.enumlabel = 'active'
  ) THEN
    ALTER TYPE public.shift_status ADD VALUE 'active';
  END IF;
END $$;