ALTER TABLE public.client_billing_codes
  ADD COLUMN IF NOT EXISTS authorization_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client_billing_codes.authorization_pending IS
  'Advisory flag set at import time when an authorization row was committed without a rate or annual units. Surfaced in UI so the admin can fill in once the 1056/PCSP supplies the values. Never blocks commit.';