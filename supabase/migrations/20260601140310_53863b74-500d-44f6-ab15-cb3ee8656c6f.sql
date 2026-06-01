-- ============================================================
-- 1) Per-org time & pay settings (singleton row keyed by org)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.time_pay_settings (
  organization_id uuid NOT NULL PRIMARY KEY,
  allow_non_client_clockins boolean NOT NULL DEFAULT true,
  pay_between_clients boolean NOT NULL DEFAULT false,
  w2_schedule text NOT NULL DEFAULT 'semi_monthly'
    CHECK (w2_schedule IN ('weekly','biweekly','semi_monthly','monthly')),
  w2_period_anchor text NOT NULL DEFAULT '1_and_16',
  contractor_schedule text NOT NULL DEFAULT 'biweekly'
    CHECK (contractor_schedule IN ('weekly','biweekly','semi_monthly','monthly')),
  contractor_period_anchor text NOT NULL DEFAULT 'friday',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_pay_settings TO authenticated;
GRANT ALL ON public.time_pay_settings TO service_role;

ALTER TABLE public.time_pay_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read time pay settings"
  ON public.time_pay_settings FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write time pay settings"
  ON public.time_pay_settings FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ============================================================
-- 2) Time-clock categories (built-ins + custom per org)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.time_pay_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  requires_description boolean NOT NULL DEFAULT false,
  is_builtin boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_time_pay_categories_org
  ON public.time_pay_categories(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_pay_categories TO authenticated;
GRANT ALL ON public.time_pay_categories TO service_role;

ALTER TABLE public.time_pay_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read time pay categories"
  ON public.time_pay_categories FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write time pay categories"
  ON public.time_pay_categories FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ============================================================
-- 3) Worker type on staff profiles (W-2 vs 1099)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS worker_type text NOT NULL DEFAULT 'w2';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_worker_type_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_worker_type_chk
      CHECK (worker_type IN ('w2','1099'));
  END IF;
END $$;
