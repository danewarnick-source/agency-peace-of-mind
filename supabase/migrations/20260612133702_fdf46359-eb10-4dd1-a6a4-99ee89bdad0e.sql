-- ============================================================
-- A2: Referrals pipeline columns
-- ============================================================
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS decision_outcome text,
  ADD COLUMN IF NOT EXISTS decision_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_stage_chk'
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_stage_chk CHECK (
        stage IN ('new','reviewing','initial_contact','iso_meeting','follow_up','decision')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_decision_outcome_chk'
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_decision_outcome_chk CHECK (
        decision_outcome IS NULL OR decision_outcome IN ('placed','passed')
      );
  END IF;
  -- Outcome only allowed when stage = 'decision'
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_decision_pairing_chk'
  ) THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_decision_pairing_chk CHECK (
        (stage = 'decision') OR (decision_outcome IS NULL AND decision_reason IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_referrals_org_stage
  ON public.referrals (organization_id, stage);

-- ============================================================
-- referral_activities — APPEND-ONLY timeline
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referral_id     uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  activity_type   text NOT NULL CHECK (
    activity_type IN ('contact','meeting','note','stage_change','email')
  ),
  channel         text CHECK (
    channel IS NULL OR channel IN ('phone','email','in_person','zoom')
  ),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body            text,
  -- For "edits": new row supersedes an older one in the same referral chain.
  supersedes_id   uuid REFERENCES public.referral_activities(id) ON DELETE SET NULL,
  -- Stage-change metadata (nullable; populated by trigger / explicit stage fn)
  stage_from      text,
  stage_to        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_activities_referral
  ON public.referral_activities (referral_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_activities_org
  ON public.referral_activities (organization_id);
CREATE INDEX IF NOT EXISTS idx_referral_activities_supersedes
  ON public.referral_activities (supersedes_id);

GRANT SELECT, INSERT ON public.referral_activities TO authenticated;
GRANT ALL ON public.referral_activities TO service_role;

ALTER TABLE public.referral_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref-activities managers read" ON public.referral_activities;
CREATE POLICY "ref-activities managers read"
  ON public.referral_activities FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ref-activities managers insert" ON public.referral_activities;
CREATE POLICY "ref-activities managers insert"
  ON public.referral_activities FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- NO update/delete policies = immutable. Even with the privileges granted,
-- RLS rejects any UPDATE or DELETE because no policy permits them.

-- ============================================================
-- Auto-log stage changes on referrals
-- ============================================================
CREATE OR REPLACE FUNCTION public.referrals_log_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_entered_at := now();
    INSERT INTO public.referral_activities (
      organization_id, referral_id, activity_type,
      occurred_at, created_by, body, stage_from, stage_to
    ) VALUES (
      NEW.organization_id, NEW.id, 'stage_change',
      now(), auth.uid(),
      CASE
        WHEN NEW.stage = 'decision' AND NEW.decision_outcome IS NOT NULL
          THEN 'Decision: ' || NEW.decision_outcome ||
               COALESCE(' — ' || NEW.decision_reason, '')
        ELSE NULL
      END,
      OLD.stage, NEW.stage
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referrals_stage_change_trg ON public.referrals;
CREATE TRIGGER referrals_stage_change_trg
  BEFORE UPDATE OF stage ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.referrals_log_stage_change();

-- ============================================================
-- Pipeline stats (per-stage counts + win/loss)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_referral_pipeline_stats(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Caller must be a manager+ of the org (mirror RLS).
  IF NOT (
    public.is_org_admin_or_manager(_organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'by_stage', COALESCE(
      (SELECT jsonb_object_agg(stage, n)
       FROM (
         SELECT stage, count(*)::int AS n
         FROM public.referrals
         WHERE organization_id = _organization_id
           AND status <> 'archived'
         GROUP BY stage
       ) s),
      '{}'::jsonb
    ),
    'placed', (
      SELECT count(*)::int FROM public.referrals
      WHERE organization_id = _organization_id
        AND stage = 'decision' AND decision_outcome = 'placed'
    ),
    'passed', (
      SELECT count(*)::int FROM public.referrals
      WHERE organization_id = _organization_id
        AND stage = 'decision' AND decision_outcome = 'passed'
    ),
    'total', (
      SELECT count(*)::int FROM public.referrals
      WHERE organization_id = _organization_id
        AND status <> 'archived'
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_referral_pipeline_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_pipeline_stats(uuid) TO authenticated;
