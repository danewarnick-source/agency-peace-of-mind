
-- Status enums
CREATE TYPE public.hhp_cue_card_status AS ENUM ('onboarding', 'ready', 'placed');
CREATE TYPE public.hhp_cue_card_source AS ENUM ('questionnaire', 'manual');

CREATE TABLE public.hhp_cue_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identity + contact
  name text NOT NULL,
  phone text,
  email text,
  address text,
  location_city text,
  location_county text,

  -- Household
  household_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  pets text,
  wheelchair_accessible boolean NOT NULL DEFAULT false,
  sign_language boolean NOT NULL DEFAULT false,
  criminal_history_flag boolean NOT NULL DEFAULT false,

  -- Experience & comfort
  experience_summary text,
  behavioral_comfort text,
  communication_abilities text,
  medical_comfort text[] NOT NULL DEFAULT '{}',
  independence_levels_accepted text[] NOT NULL DEFAULT '{}',

  -- Availability
  schedule_availability text,
  commitment_length text,

  -- Provider-input section (fills in over time as onboarding progresses)
  provider_notes text,
  status public.hhp_cue_card_status NOT NULL DEFAULT 'onboarding',

  -- Provenance
  source public.hhp_cue_card_source NOT NULL DEFAULT 'manual',
  form_submission_id uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,

  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (form_submission_id)
);

CREATE INDEX idx_hhp_cue_cards_org_status ON public.hhp_cue_cards(organization_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hhp_cue_cards TO authenticated;
GRANT ALL ON public.hhp_cue_cards TO service_role;

ALTER TABLE public.hhp_cue_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hhp_read" ON public.hhp_cue_cards
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_permission(auth.uid(), organization_id, 'view_referrals')
      OR public.has_permission(auth.uid(), organization_id, 'manage_referrals')
    )
  );

CREATE POLICY "hhp_write" ON public.hhp_cue_cards
  FOR ALL TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND public.has_permission(auth.uid(), organization_id, 'manage_referrals')
  )
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.has_permission(auth.uid(), organization_id, 'manage_referrals')
  );

CREATE TRIGGER hhp_cue_cards_touch
  BEFORE UPDATE ON public.hhp_cue_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Auto-gen from Host Home Questionnaire submission ────────────
-- Fires when a form submission lands and the parent form is categorized
-- as 'host_home_questionnaire'. Maps known answer keys → cue card fields.
-- Unknown keys are ignored. SECURITY DEFINER so it bypasses RLS at write
-- time (the submitter may not have manage_referrals).
CREATE OR REPLACE FUNCTION public.hhp_cue_card_from_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _category text;
  _a jsonb;
  _name text;
BEGIN
  SELECT category INTO _category FROM public.forms WHERE id = NEW.form_id;
  IF _category IS DISTINCT FROM 'host_home_questionnaire' THEN
    RETURN NEW;
  END IF;

  -- Skip drafts
  IF NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;

  -- Idempotency: one cue card per submission
  IF EXISTS (SELECT 1 FROM public.hhp_cue_cards WHERE form_submission_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  _a := COALESCE(NEW.answers, '{}'::jsonb);
  _name := COALESCE(
    NULLIF(_a->>'name', ''),
    NULLIF(trim(concat_ws(' ', _a->>'first_name', _a->>'last_name')), ''),
    'Unnamed host'
  );

  INSERT INTO public.hhp_cue_cards(
    organization_id, name, phone, email, address,
    location_city, location_county,
    household_members, pets, wheelchair_accessible, sign_language,
    criminal_history_flag,
    experience_summary, behavioral_comfort, communication_abilities,
    medical_comfort, independence_levels_accepted,
    schedule_availability, commitment_length,
    source, form_submission_id, created_by
  ) VALUES (
    NEW.organization_id,
    _name,
    NULLIF(_a->>'phone', ''),
    NULLIF(_a->>'email', ''),
    NULLIF(_a->>'address', ''),
    NULLIF(_a->>'location_city', ''),
    NULLIF(_a->>'location_county', ''),
    COALESCE(_a->'household_members', '[]'::jsonb),
    NULLIF(_a->>'pets', ''),
    COALESCE((_a->>'wheelchair_accessible')::boolean, false),
    COALESCE((_a->>'sign_language')::boolean, false),
    COALESCE((_a->>'criminal_history_flag')::boolean, false),
    NULLIF(_a->>'experience_summary', ''),
    NULLIF(_a->>'behavioral_comfort', ''),
    NULLIF(_a->>'communication_abilities', ''),
    CASE
      WHEN jsonb_typeof(_a->'medical_comfort') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(_a->'medical_comfort'))
      ELSE '{}'::text[]
    END,
    CASE
      WHEN jsonb_typeof(_a->'independence_levels_accepted') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(_a->'independence_levels_accepted'))
      ELSE '{}'::text[]
    END,
    NULLIF(_a->>'schedule_availability', ''),
    NULLIF(_a->>'commitment_length', ''),
    'questionnaire'::public.hhp_cue_card_source,
    NEW.id,
    NEW.submitted_by
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hhp_cue_card_from_submission() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER form_submissions_hhp_cue_card
  AFTER INSERT ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.hhp_cue_card_from_submission();
