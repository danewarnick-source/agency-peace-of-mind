
ALTER TABLE public.hhs_monthly_attendance
  ADD COLUMN IF NOT EXISTS staff_initials_signature text,
  ADD COLUMN IF NOT EXISTS attestation_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS electronic_signature_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS signee_user_id uuid,
  ADD COLUMN IF NOT EXISTS signee_ip_address text,
  ADD COLUMN IF NOT EXISTS away_category text;
