
-- Part 1: clients guardian fields
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_own_guardian boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS guardian_relationship text,
  ADD COLUMN IF NOT EXISTS guardian_email text,
  ADD COLUMN IF NOT EXISTS guardian_address text;

-- Validation trigger (use trigger, not CHECK — kept simple/immutable-safe)
CREATE OR REPLACE FUNCTION public.validate_client_guardian()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_own_guardian THEN
    -- Self-guardian: clear any stale guardian-of-record fields
    NEW.guardian_name := NULL;
    NEW.guardian_phone := NULL;
    NEW.guardian_relationship := NULL;
    NEW.guardian_email := NULL;
    NEW.guardian_address := NULL;
  ELSE
    IF NEW.guardian_name IS NULL OR btrim(NEW.guardian_name) = '' THEN
      RAISE EXCEPTION 'Guardian name is required when the client is not their own guardian.';
    END IF;
    IF NEW.guardian_phone IS NULL OR btrim(NEW.guardian_phone) = '' THEN
      RAISE EXCEPTION 'Guardian phone is required when the client is not their own guardian.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_validate_guardian ON public.clients;
CREATE TRIGGER clients_validate_guardian
  BEFORE INSERT OR UPDATE OF is_own_guardian, guardian_name, guardian_phone,
                              guardian_relationship, guardian_email, guardian_address
  ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.validate_client_guardian();

-- Part 4: per-action attestation columns on incident_reports
ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS guardian_attestation_text text,
  ADD COLUMN IF NOT EXISTS guardian_signed_name text,
  ADD COLUMN IF NOT EXISTS guardian_signed_title text,
  ADD COLUMN IF NOT EXISTS guardian_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS upi_initiated_attestation_text text,
  ADD COLUMN IF NOT EXISTS upi_initiated_signed_name text,
  ADD COLUMN IF NOT EXISTS upi_initiated_signed_title text,
  ADD COLUMN IF NOT EXISTS upi_completed_attestation_text text,
  ADD COLUMN IF NOT EXISTS upi_completed_signed_name text,
  ADD COLUMN IF NOT EXISTS upi_completed_signed_title text,
  ADD COLUMN IF NOT EXISTS sc_update_attestation_text text,
  ADD COLUMN IF NOT EXISTS sc_update_signed_name text,
  ADD COLUMN IF NOT EXISTS sc_update_signed_title text,
  ADD COLUMN IF NOT EXISTS sc_update_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sc_update_signed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sc_update_notes text;
