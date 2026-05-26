
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS geofence_radius_feet integer NOT NULL DEFAULT 1000;

ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS timezone_setting text NOT NULL DEFAULT 'America/Denver',
  ADD COLUMN IF NOT EXISTS outside_geofence_reason text;
