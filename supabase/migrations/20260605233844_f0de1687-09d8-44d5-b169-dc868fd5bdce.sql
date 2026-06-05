
ALTER TABLE public.training_completions
  ADD COLUMN IF NOT EXISTS signer_full_name text,
  ADD COLUMN IF NOT EXISTS signer_email text,
  ADD COLUMN IF NOT EXISTS consent_statement text,
  ADD COLUMN IF NOT EXISTS consent_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_version text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS time_zone text,
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Append-only immutability: block UPDATE and DELETE on training_completions
CREATE OR REPLACE FUNCTION public.training_completions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow only the system trigger that flips is_current to false on prior rows.
  IF TG_OP = 'UPDATE'
     AND OLD.is_current = true
     AND NEW.is_current = false
     AND OLD.id = NEW.id
     AND OLD.user_id = NEW.user_id
     AND OLD.ref_id = NEW.ref_id
     AND OLD.topic_kind = NEW.topic_kind
     AND OLD.typed_signature = NEW.typed_signature
     AND OLD.attestation_statement = NEW.attestation_statement
     AND OLD.completed_at = NEW.completed_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'training_completions is append-only; signature records cannot be edited or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS training_completions_no_update ON public.training_completions;
CREATE TRIGGER training_completions_no_update
BEFORE UPDATE ON public.training_completions
FOR EACH ROW EXECUTE FUNCTION public.training_completions_immutable();

DROP TRIGGER IF EXISTS training_completions_no_delete ON public.training_completions;
CREATE TRIGGER training_completions_no_delete
BEFORE DELETE ON public.training_completions
FOR EACH ROW EXECUTE FUNCTION public.training_completions_immutable();
