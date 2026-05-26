ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS raw_clock_in timestamptz,
  ADD COLUMN IF NOT EXISTS raw_clock_out timestamptz,
  ADD COLUMN IF NOT EXISTS rounded_clock_in timestamptz,
  ADD COLUMN IF NOT EXISTS rounded_clock_out timestamptz;

UPDATE public.evv_timesheets
  SET raw_clock_in = COALESCE(raw_clock_in, clock_in_timestamp),
      raw_clock_out = COALESCE(raw_clock_out, clock_out_timestamp);