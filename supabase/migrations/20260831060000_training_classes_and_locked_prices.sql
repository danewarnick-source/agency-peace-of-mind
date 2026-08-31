-- Training chunk 2: class rosters + locked prices.
-- Idempotent. Do NOT drop or truncate. Do NOT run against production from CI —
-- Dane reviews this in the PR, then pastes it into Lovable's SQL editor
-- (clear the editor first). See docs/SQL_HANDOFF.md.

-- ── Table 1: training_classes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  training_type text NOT NULL
    CHECK (training_type IN ('cpr_first_aid', 'mandt', 'thirty_day', 'package')),
  is_external boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'completed', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'waived', 'cancelled')),
  seat_count integer NOT NULL DEFAULT 1 CHECK (seat_count >= 1 AND seat_count <= 200),
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  exec_alerted_at timestamptz,
  provider_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_classes_org_idx
  ON public.training_classes (organization_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS training_classes_type_status_idx
  ON public.training_classes (training_type, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS training_classes_stripe_session_idx
  ON public.training_classes (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE public.training_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_classes_select_admin_or_exec" ON public.training_classes;
CREATE POLICY "training_classes_select_admin_or_exec"
  ON public.training_classes FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "training_classes_insert_admin" ON public.training_classes;
CREATE POLICY "training_classes_insert_admin"
  ON public.training_classes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "training_classes_update_admin_or_exec" ON public.training_classes;
CREATE POLICY "training_classes_update_admin_or_exec"
  ON public.training_classes FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.training_classes TO authenticated;
GRANT ALL ON public.training_classes TO service_role;

-- ── Table 2: training_class_roster ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_class_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.training_classes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_user_id uuid,
  staff_name text NOT NULL,
  staff_email text NOT NULL,
  staff_phone text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_class_roster_class_idx
  ON public.training_class_roster (class_id, sort_order);
CREATE INDEX IF NOT EXISTS training_class_roster_org_idx
  ON public.training_class_roster (organization_id);
CREATE INDEX IF NOT EXISTS training_class_roster_email_idx
  ON public.training_class_roster (organization_id, staff_email);

ALTER TABLE public.training_class_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_class_roster_select_admin_or_exec" ON public.training_class_roster;
CREATE POLICY "training_class_roster_select_admin_or_exec"
  ON public.training_class_roster FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "training_class_roster_insert_admin" ON public.training_class_roster;
CREATE POLICY "training_class_roster_insert_admin"
  ON public.training_class_roster FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "training_class_roster_update_admin_or_exec" ON public.training_class_roster;
CREATE POLICY "training_class_roster_update_admin_or_exec"
  ON public.training_class_roster FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.training_class_roster TO authenticated;
GRANT ALL ON public.training_class_roster TO service_role;

-- ── Locked prices on leftover catalogs (no drops) ─────────────────────────
UPDATE public.training_products
SET
  price_cents = CASE sku
    WHEN 'CPR_FIRST_AID' THEN 10000
    WHEN 'MANDT' THEN 20000
    WHEN 'ORIENTATION_30' THEN 7500
    ELSE price_cents
  END,
  name = CASE sku
    WHEN 'ORIENTATION_30' THEN '30-Day Orientation Training'
    ELSE name
  END
WHERE sku IN ('CPR_FIRST_AID', 'MANDT', 'ORIENTATION_30');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hive_training_catalog'
  ) THEN
    UPDATE public.hive_training_catalog
    SET
      price_cents = CASE sku
        WHEN 'cpr_first_aid' THEN 10000
        WHEN 'mandt' THEN 20000
        WHEN 'dspd_required' THEN 7500
        WHEN 'full_program' THEN 30000
        ELSE price_cents
      END,
      name = CASE sku
        WHEN 'dspd_required' THEN '30-day orientation'
        WHEN 'full_program' THEN 'Training package'
        ELSE name
      END
    WHERE sku IN ('cpr_first_aid', 'mandt', 'dspd_required', 'full_program');
  END IF;
END $$;

-- ── notifications.type: add hive_training_class (inbox alert) ─────────────
-- Appends one allowed value. Does not drop existing types. Idempotent.
DO $$
DECLARE
  def text;
  inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  IF def IS NOT NULL AND def ILIKE '%hive_training_class%' THEN
    RETURN;
  END IF;

  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

  IF def IS NULL THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (type = ANY (ARRAY['hive_training_class'::text]));
    RETURN;
  END IF;

  inner_expr := regexp_replace(def, '^CHECK\s*\(', '');
  inner_expr := left(inner_expr, length(inner_expr) - 1);

  IF inner_expr ~* 'ARRAY\[' THEN
    inner_expr := regexp_replace(inner_expr, '\]\s*$', ', ''hive_training_class''::text]');
  ELSIF inner_expr ~* 'IN\s*\(' THEN
    inner_expr := regexp_replace(inner_expr, '\)\s*$', ', ''hive_training_class'')');
  ELSE
    inner_expr := 'type = ANY (ARRAY[''hive_training_class''::text])';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (%s)',
    inner_expr
  );
END $$;
