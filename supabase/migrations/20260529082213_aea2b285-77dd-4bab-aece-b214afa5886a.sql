-- Add created_by column for shift authorship
ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Add foreign keys so PostgREST embedded selects (clients:client_id, profiles:staff_id) work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_shifts_client_id_fkey'
  ) THEN
    ALTER TABLE public.scheduled_shifts
      ADD CONSTRAINT scheduled_shifts_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_shifts_staff_id_fkey'
  ) THEN
    ALTER TABLE public.scheduled_shifts
      ADD CONSTRAINT scheduled_shifts_staff_id_fkey
      FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;