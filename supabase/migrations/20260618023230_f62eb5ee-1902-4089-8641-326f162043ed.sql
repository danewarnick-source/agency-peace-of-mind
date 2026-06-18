
ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS staff_count integer,
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_subscriptions_billing_interval_chk') THEN
    ALTER TABLE public.org_subscriptions
      ADD CONSTRAINT org_subscriptions_billing_interval_chk
      CHECK (billing_interval IS NULL OR billing_interval IN ('monthly','annual'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS org_subscriptions_stripe_subscription_id_key
  ON public.org_subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_subscriptions_stripe_customer_id_key
  ON public.org_subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.org_training_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  training_type text NOT NULL CHECK (training_type IN ('full','alacarte','none')),
  selected_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  staff_count integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_training_orders TO authenticated;
GRANT ALL ON public.org_training_orders TO service_role;

ALTER TABLE public.org_training_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view training orders"
  ON public.org_training_orders FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins can insert training orders"
  ON public.org_training_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins can update training orders"
  ON public.org_training_orders FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS org_training_orders_org_id_idx ON public.org_training_orders (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS org_training_orders_stripe_pi_key
  ON public.org_training_orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE TRIGGER update_org_training_orders_updated_at
  BEFORE UPDATE ON public.org_training_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
