-- Training-only public purchases (no agency workspace).
-- Idempotent. Do NOT drop or truncate. Do NOT run against production from CI —
-- Dane reviews this in the PR, then pastes it into Lovable's SQL editor
-- (clear the editor first). See docs/SQL_HANDOFF.md.
--
-- These tables hold paying outsiders. They must NOT create an organization,
-- organization_members row, or True North staff/client. Hive Executive
-- Training (/dashboard/hive-exec/classes) reads these seats so Dane can
-- schedule the class and send access.

-- ── handle_new_user: skip workspace for training-only logins ──────────────
-- Same body as 20260827183000 plus created_via = 'training_only'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_space_pos INT;
  v_created_via TEXT;
BEGIN
  v_full_name := NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), '');
  IF v_full_name IS NOT NULL THEN
    v_space_pos := position(' ' IN v_full_name);
    IF v_space_pos > 0 THEN
      v_first_name := btrim(substring(v_full_name FROM 1 FOR v_space_pos - 1));
      v_last_name := NULLIF(btrim(substring(v_full_name FROM v_space_pos + 1)), '');
    ELSE
      v_first_name := v_full_name;
      v_last_name := NULL;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, agency_name, first_name, last_name)
  VALUES (NEW.id, NEW.email, v_full_name, NEW.raw_user_meta_data->>'agency_name', v_first_name, v_last_name)
  ON CONFLICT (id) DO NOTHING;

  -- Invite join, Add-manually, and training-only 30-day logins already have
  -- a destination. Do not spin up "{email}'s workspace" for those paths.
  v_created_via := coalesce(NEW.raw_user_meta_data->>'created_via', '');
  IF v_created_via IN ('invitation', 'manual_admin', 'training_only') THEN
    RETURN NEW;
  END IF;

  org_name := COALESCE(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 1) || '''s workspace');

  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (org_name, lower(regexp_replace(org_name || '-' || substr(NEW.id::text, 1, 6), '[^a-z0-9]+', '-', 'g')), NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$;

-- ── Table 1: training_only_orders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_only_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_email text NOT NULL,
  buyer_agency_name text,
  terms_accepted_at timestamptz NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS training_only_orders_stripe_session_uidx
  ON public.training_only_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS training_only_orders_status_idx
  ON public.training_only_orders (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS training_only_orders_buyer_idx
  ON public.training_only_orders (buyer_email, created_at DESC);

ALTER TABLE public.training_only_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_only_orders_select_exec" ON public.training_only_orders;
CREATE POLICY "training_only_orders_select_exec"
  ON public.training_only_orders FOR SELECT TO authenticated
  USING (public.is_hive_executive(auth.uid()));

DROP POLICY IF EXISTS "training_only_orders_update_exec" ON public.training_only_orders;
CREATE POLICY "training_only_orders_update_exec"
  ON public.training_only_orders FOR UPDATE TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

GRANT SELECT, UPDATE ON public.training_only_orders TO authenticated;
GRANT ALL ON public.training_only_orders TO service_role;

-- ── Table 2: training_only_seats (one named person + one SKU) ─────────────
CREATE TABLE IF NOT EXISTS public.training_only_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.training_only_orders(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  person_email text,
  sku text NOT NULL
    CHECK (sku IN ('cpr_first_aid', 'thirty_day', 'mandt', 'pack')),
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  fulfillment_status text NOT NULL DEFAULT 'awaiting_setup'
    CHECK (fulfillment_status IN ('awaiting_setup', 'scheduled', 'sent', 'completed')),
  class_date date,
  class_notes text,
  sent_at timestamptz,
  sent_by uuid,
  sent_to_email text,
  access_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_only_seats_order_idx
  ON public.training_only_seats (order_id, created_at);
CREATE INDEX IF NOT EXISTS training_only_seats_sku_idx
  ON public.training_only_seats (sku, fulfillment_status);
CREATE INDEX IF NOT EXISTS training_only_seats_access_idx
  ON public.training_only_seats (access_user_id)
  WHERE access_user_id IS NOT NULL;

ALTER TABLE public.training_only_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "training_only_seats_select_exec_or_self" ON public.training_only_seats;
CREATE POLICY "training_only_seats_select_exec_or_self"
  ON public.training_only_seats FOR SELECT TO authenticated
  USING (
    public.is_hive_executive(auth.uid())
    OR access_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "training_only_seats_update_exec" ON public.training_only_seats;
CREATE POLICY "training_only_seats_update_exec"
  ON public.training_only_seats FOR UPDATE TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

GRANT SELECT, UPDATE ON public.training_only_seats TO authenticated;
GRANT ALL ON public.training_only_seats TO service_role;

-- Confirm (no PHI): table names + skip list only.
SELECT
  to_regclass('public.training_only_orders') IS NOT NULL AS orders_ready,
  to_regclass('public.training_only_seats') IS NOT NULL AS seats_ready;
