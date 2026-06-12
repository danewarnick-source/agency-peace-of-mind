
-- A7: referral retention / archive lifecycle

-- 1) Add archive cols to referrals
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz;

CREATE INDEX IF NOT EXISTS idx_referrals_archived_at ON public.referrals(organization_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_referrals_purge_after ON public.referrals(purge_after) WHERE purge_after IS NOT NULL;

-- 2) Extend referral_activities check constraint to allow archive/restore/purge entries
ALTER TABLE public.referral_activities DROP CONSTRAINT IF EXISTS referral_activities_activity_type_check;
ALTER TABLE public.referral_activities ADD CONSTRAINT referral_activities_activity_type_check
  CHECK (activity_type = ANY (ARRAY['contact','meeting','note','stage_change','email','archive','restore','purge']));

-- 3) Retention settings table (org-scoped, single row per org)
CREATE TABLE IF NOT EXISTS public.org_referral_retention_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  archive_days_after_due int NOT NULL DEFAULT 90,
  purge_grace_days int NOT NULL DEFAULT 30,
  auto_archive_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT archive_days_min CHECK (archive_days_after_due >= 30),
  CONSTRAINT purge_grace_min CHECK (purge_grace_days >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_referral_retention_settings TO authenticated;
GRANT ALL ON public.org_referral_retention_settings TO service_role;

ALTER TABLE public.org_referral_retention_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention managers read" ON public.org_referral_retention_settings
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "retention managers write" ON public.org_referral_retention_settings
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER org_referral_retention_touch
  BEFORE UPDATE ON public.org_referral_retention_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Sweep function: archive eligible referrals for an org
CREATE OR REPLACE FUNCTION public.archive_eligible_referrals(_organization_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings record;
  _count int := 0;
BEGIN
  SELECT * INTO _settings FROM public.org_referral_retention_settings
    WHERE organization_id = _organization_id;
  IF NOT FOUND OR NOT _settings.auto_archive_enabled THEN
    RETURN 0;
  END IF;

  WITH eligible AS (
    SELECT id FROM public.referrals
     WHERE organization_id = _organization_id
       AND archived_at IS NULL
       AND status <> 'archived'
       AND COALESCE(decision_outcome, '') <> 'placed'
       AND due_date IS NOT NULL
       AND now() > (due_date + (_settings.archive_days_after_due || ' days')::interval)
  ), updated AS (
    UPDATE public.referrals r
       SET archived_at = now(),
           archived_by = NULL,
           archive_reason = 'auto: past due window',
           purge_after = now() + (_settings.purge_grace_days || ' days')::interval,
           status = 'archived'
      FROM eligible e
     WHERE r.id = e.id
     RETURNING r.id, r.organization_id
  ), logged AS (
    INSERT INTO public.referral_activities
      (organization_id, referral_id, activity_type, occurred_at, body, created_by)
    SELECT organization_id, id, 'archive', now(), 'Auto-archived (past due + retention window)', NULL
      FROM updated
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM logged;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_eligible_referrals(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.archive_eligible_referrals(uuid) TO authenticated, service_role;

-- 5) Purge function: hard-delete fully aged archived referrals (keeps tombstone via activity log entry)
CREATE OR REPLACE FUNCTION public.purge_aged_referrals(_organization_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT id, first_name, archived_at, archive_reason, decision_outcome
      FROM public.referrals
     WHERE organization_id = _organization_id
       AND archived_at IS NOT NULL
       AND purge_after IS NOT NULL
       AND now() > purge_after
  LOOP
    -- Write tombstone activity (immutable trail) BEFORE deleting referral
    -- We log a synthetic referral_id-less row by inserting on a tombstone-table approach…
    -- Simpler: nullify FK in activities and keep them via supersedes; the activities ON DELETE CASCADE
    -- removes them — so write a final note in a dedicated tombstone table.
    INSERT INTO public.referral_purge_tombstones
      (organization_id, referral_id, archived_at, archive_reason, decision_outcome, purged_at)
    VALUES (_organization_id, _r.id, _r.archived_at, _r.archive_reason, _r.decision_outcome, now());

    DELETE FROM public.referrals WHERE id = _r.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;

-- 6) Tombstone table — minimal audit trail of purged referrals
CREATE TABLE IF NOT EXISTS public.referral_purge_tombstones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL,
  archived_at timestamptz NOT NULL,
  archive_reason text,
  decision_outcome text,
  purged_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.referral_purge_tombstones TO authenticated;
GRANT ALL ON public.referral_purge_tombstones TO service_role;

ALTER TABLE public.referral_purge_tombstones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tombstones managers read" ON public.referral_purge_tombstones
  FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "tombstones service insert" ON public.referral_purge_tombstones
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Re-grant after table create (purge fn was created first referencing it via dynamic body, fine)
REVOKE ALL ON FUNCTION public.purge_aged_referrals(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_aged_referrals(uuid) TO authenticated, service_role;
