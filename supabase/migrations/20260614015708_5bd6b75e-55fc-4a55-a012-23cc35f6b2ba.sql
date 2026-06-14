
ALTER TABLE public.host_home_certifications
  ADD COLUMN IF NOT EXISTS hhp_cue_card_id uuid REFERENCES public.hhp_cue_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attestation_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attestation_text text;

CREATE INDEX IF NOT EXISTS idx_hhc_hhp_card ON public.host_home_certifications(hhp_cue_card_id);

-- Validation trigger replaces immutable CHECKs for the certifying gate.
CREATE OR REPLACE FUNCTION public.validate_host_home_certification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.determination IN ('certified', 'certified_with_corrections') THEN
    IF NOT NEW.inspector_not_host_confirmed THEN
      RAISE EXCEPTION 'Inspector must confirm they are not the host home staff before certifying.';
    END IF;
    IF NOT NEW.attestation_confirmed THEN
      RAISE EXCEPTION 'Attestation must be confirmed before certifying.';
    END IF;
    IF coalesce(btrim(NEW.signature_name), '') = '' OR coalesce(btrim(NEW.signature_title), '') = '' THEN
      RAISE EXCEPTION 'Signature name and title are required to certify.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_host_home_certification ON public.host_home_certifications;
CREATE TRIGGER trg_validate_host_home_certification
BEFORE INSERT OR UPDATE ON public.host_home_certifications
FOR EACH ROW EXECUTE FUNCTION public.validate_host_home_certification();

-- When a 'certified' result is recorded, move the host's kanban card to 'placed'.
CREATE OR REPLACE FUNCTION public.host_home_cert_advance_host()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.hhp_cue_card_id IS NOT NULL
     AND NEW.determination = 'certified' THEN
    UPDATE public.hhp_cue_cards
       SET status = 'placed', updated_at = now()
     WHERE id = NEW.hhp_cue_card_id
       AND organization_id = NEW.organization_id
       AND status <> 'placed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_host_home_cert_advance_host ON public.host_home_certifications;
CREATE TRIGGER trg_host_home_cert_advance_host
AFTER INSERT OR UPDATE OF determination ON public.host_home_certifications
FOR EACH ROW EXECUTE FUNCTION public.host_home_cert_advance_host();
