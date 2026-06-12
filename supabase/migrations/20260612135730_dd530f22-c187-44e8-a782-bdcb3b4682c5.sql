-- Phase A5: Referral match scores cache + invalidation triggers.
-- Scoring itself is computed deterministically in the server function;
-- this table only caches the latest result. Triggers delete cached rows
-- when underlying data changes so the next read recomputes.

CREATE TABLE public.referral_match_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL UNIQUE REFERENCES public.referrals(id) ON DELETE CASCADE,
  overall_score numeric(4,1) NOT NULL,
  location_fit numeric(4,1) NOT NULL,
  host_fit numeric(4,1) NOT NULL,
  disability_fit numeric(4,1) NOT NULL,
  need_fit numeric(4,1) NOT NULL,
  code_overlap numeric(4,1) NOT NULL,
  best_host_ids uuid[] NOT NULL DEFAULT '{}',
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rms_org ON public.referral_match_scores(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_match_scores TO authenticated;
GRANT ALL ON public.referral_match_scores TO service_role;

ALTER TABLE public.referral_match_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rms read" ON public.referral_match_scores
  FOR SELECT TO authenticated
  USING (
    is_org_member(auth.uid(), organization_id)
    AND (
      has_permission(auth.uid(), organization_id, 'view_referrals')
      OR has_permission(auth.uid(), organization_id, 'manage_referrals')
    )
  );

CREATE POLICY "rms write" ON public.referral_match_scores
  FOR ALL TO authenticated
  USING (
    is_org_member(auth.uid(), organization_id)
    AND has_permission(auth.uid(), organization_id, 'manage_referrals')
  )
  WITH CHECK (
    is_org_member(auth.uid(), organization_id)
    AND has_permission(auth.uid(), organization_id, 'manage_referrals')
  );

-- ─── Invalidation ─────────────────────────────────────────────

-- Drop the cached row for a referral whenever the referral changes.
CREATE OR REPLACE FUNCTION public.invalidate_referral_match_score_one()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.referral_match_scores WHERE referral_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER referrals_invalidate_match_score
AFTER INSERT OR UPDATE OF
  location_city, location_county, disability_types, disability_level,
  requested_codes, need_level, description, category
ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.invalidate_referral_match_score_one();

-- Drop all cached rows for an org when hosts or outline change.
CREATE OR REPLACE FUNCTION public.invalidate_referral_match_scores_for_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org_id uuid;
BEGIN
  org_id := COALESCE(NEW.organization_id, OLD.organization_id);
  IF org_id IS NOT NULL THEN
    DELETE FROM public.referral_match_scores WHERE organization_id = org_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER hhp_cue_cards_invalidate_match_scores
AFTER INSERT OR UPDATE OR DELETE ON public.hhp_cue_cards
FOR EACH ROW EXECUTE FUNCTION public.invalidate_referral_match_scores_for_org();

CREATE TRIGGER outline_invalidate_match_scores
AFTER INSERT OR UPDATE OR DELETE ON public.provider_interest_outline
FOR EACH ROW EXECUTE FUNCTION public.invalidate_referral_match_scores_for_org();