
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS evv_gps_consent_status text NOT NULL DEFAULT 'Unanswered',
  ADD COLUMN IF NOT EXISTS evv_consent_timestamp timestamptz NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_evv_gps_consent_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_evv_gps_consent_status_check
  CHECK (evv_gps_consent_status IN ('Unanswered','Accepted','Declined'));
