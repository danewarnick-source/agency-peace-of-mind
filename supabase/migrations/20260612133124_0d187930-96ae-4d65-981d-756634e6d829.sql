-- CRM Phase A1: Referrals + Support Coordinators
-- PHI-adjacent: admin/manager + super_admin only. Staff blocked.

-- ============================================================
-- support_coordinators (first-class; referrals FK here)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_coordinators (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  agency          text,
  email           text,
  phone           text,
  region          text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_coordinators_org
  ON public.support_coordinators (organization_id);
CREATE INDEX IF NOT EXISTS idx_support_coordinators_name_lower
  ON public.support_coordinators (organization_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_coordinators TO authenticated;
GRANT ALL ON public.support_coordinators TO service_role;

ALTER TABLE public.support_coordinators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc managers read" ON public.support_coordinators;
CREATE POLICY "sc managers read"
  ON public.support_coordinators FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "sc managers insert" ON public.support_coordinators;
CREATE POLICY "sc managers insert"
  ON public.support_coordinators FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "sc managers update" ON public.support_coordinators;
CREATE POLICY "sc managers update"
  ON public.support_coordinators FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "sc managers delete" ON public.support_coordinators;
CREATE POLICY "sc managers delete"
  ON public.support_coordinators FOR DELETE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP TRIGGER IF EXISTS support_coordinators_touch_updated_at ON public.support_coordinators;
CREATE TRIGGER support_coordinators_touch_updated_at
  BEFORE UPDATE ON public.support_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- referrals (prospective clients — Tyler intake form output)
-- ============================================================
-- Conversion-readiness note: when a referral is placed, fields map to
-- public.clients as follows:
--   first_name              -> clients.first_name
--   age (or due_date math)  -> derive clients.date_of_birth at conversion
--   location_city/county    -> clients.physical_address (composed)
--   requested_codes         -> clients.authorized_dspd_codes (after auth)
--   category                -> drives team/home assignment workflow
-- last_name is captured separately at conversion time; A1 only stores first_name
-- because referrals often arrive with just first name + last initial.

CREATE TABLE IF NOT EXISTS public.referrals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- identity (intentionally lean; full demographic captured at conversion)
  first_name              text NOT NULL,
  age                     integer,
  gender                  text,
  date_of_birth           date,

  -- placement profile
  location_city           text,
  location_county         text,
  disability_types        text[] NOT NULL DEFAULT ARRAY[]::text[],
  disability_level        text,
  requested_codes         text[] NOT NULL DEFAULT ARRAY[]::text[],
  budget_note             text,
  need_level              text,
  description             text,

  -- routing
  category                text NOT NULL
    CHECK (category IN ('direct_support', 'rhs', 'hhs')),
  source                  text NOT NULL DEFAULT 'manual_upload'
    CHECK (source IN ('manual_upload', 'call_capture', 'email')),
  support_coordinator_id  uuid REFERENCES public.support_coordinators(id) ON DELETE SET NULL,
  due_date                date,

  -- lifecycle (pipeline_stage / activity_log / match_score / archive_at land in later increments)
  status                  text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_pipeline', 'placed', 'passed', 'archived')),

  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_org
  ON public.referrals (organization_id);
CREATE INDEX IF NOT EXISTS idx_referrals_org_category
  ON public.referrals (organization_id, category);
CREATE INDEX IF NOT EXISTS idx_referrals_org_status
  ON public.referrals (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_sc
  ON public.referrals (support_coordinator_id);
CREATE INDEX IF NOT EXISTS idx_referrals_due_date
  ON public.referrals (organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_referrals_first_name_lower
  ON public.referrals (organization_id, lower(first_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referrals managers read" ON public.referrals;
CREATE POLICY "referrals managers read"
  ON public.referrals FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "referrals managers insert" ON public.referrals;
CREATE POLICY "referrals managers insert"
  ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "referrals managers update" ON public.referrals;
CREATE POLICY "referrals managers update"
  ON public.referrals FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "referrals managers delete" ON public.referrals;
CREATE POLICY "referrals managers delete"
  ON public.referrals FOR DELETE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP TRIGGER IF EXISTS referrals_touch_updated_at ON public.referrals;
CREATE TRIGGER referrals_touch_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Duplicate detection (non-blocking)
-- Same org + same lowercased first_name + same age (when both present)
-- + same support_coordinator (when set) within the last 90 days.
-- Returns matching rows; caller surfaces a warning. SECURITY DEFINER so the
-- check runs uniformly even when callers narrow with RLS later.
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_possible_duplicate_referral(
  _organization_id        uuid,
  _first_name             text,
  _age                    integer,
  _support_coordinator_id uuid
)
RETURNS TABLE (
  id                     uuid,
  first_name             text,
  age                    integer,
  category               text,
  support_coordinator_id uuid,
  created_at             timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.first_name, r.age, r.category, r.support_coordinator_id, r.created_at
  FROM public.referrals r
  WHERE r.organization_id = _organization_id
    AND lower(r.first_name) = lower(_first_name)
    AND (
      _age IS NULL OR r.age IS NULL OR r.age = _age
    )
    AND (
      _support_coordinator_id IS NULL
      OR r.support_coordinator_id IS NULL
      OR r.support_coordinator_id = _support_coordinator_id
    )
    AND r.created_at >= now() - interval '90 days'
    AND r.status <> 'archived'
  ORDER BY r.created_at DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.find_possible_duplicate_referral(uuid, text, integer, uuid)
  TO authenticated;
