ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS medicaid_id text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS clock_in_bypass_reason text,
  ADD COLUMN IF NOT EXISTS clock_out_bypass_reason text;

-- Backfill legacy single bypass column into the new clock_in slot
UPDATE public.shifts
   SET clock_in_bypass_reason = geofence_bypass_reason
 WHERE clock_in_bypass_reason IS NULL
   AND geofence_bypass_reason IS NOT NULL;