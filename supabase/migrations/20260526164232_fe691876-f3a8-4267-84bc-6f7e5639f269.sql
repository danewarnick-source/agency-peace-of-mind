
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS gps_validated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_out_of_bounds boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geofence_variance_justification text;
