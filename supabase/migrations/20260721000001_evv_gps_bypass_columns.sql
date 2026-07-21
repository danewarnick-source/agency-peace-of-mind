-- GPS-unavailable bypass on EVV-locked clock-in/out (Utah UEVV allows address
-- OR GPS at begin/end of visit — this is not a geofence variance, so it gets
-- its own flags distinct from outside_geofence_reason/is_out_of_bounds).
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS gps_in_bypassed      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_in_bypass_reason text,
  ADD COLUMN IF NOT EXISTS gps_out_bypassed      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_out_bypass_reason text;
