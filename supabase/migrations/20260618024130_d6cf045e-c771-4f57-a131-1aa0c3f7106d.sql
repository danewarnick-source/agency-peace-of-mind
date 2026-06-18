
-- 1) org_subscriptions billing/lockout columns (Stripe-shaped, all nullable)
ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_reason text,
  ADD COLUMN IF NOT EXISTS card_expires_at date,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_error text;

CREATE INDEX IF NOT EXISTS org_subscriptions_locked_at_idx
  ON public.org_subscriptions (locked_at) WHERE locked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_subscriptions_past_due_since_idx
  ON public.org_subscriptions (past_due_since) WHERE past_due_since IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_subscriptions_next_retry_at_idx
  ON public.org_subscriptions (next_retry_at) WHERE next_retry_at IS NOT NULL;

-- 2) payment_events table
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'payment_succeeded',
    'payment_failed',
    'payment_retried',
    'card_expiry_warning',
    'account_locked',
    'account_unlocked',
    'payment_method_updated',
    'subscription_cancelled',
    'stripe_webhook_received'
  )),
  amount_cents integer,
  failure_reason text,
  stripe_event_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reads for org admins/managers only; writes restricted to service_role.
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view their org payment events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(org_id, auth.uid()));

-- No INSERT / UPDATE / DELETE policies for authenticated.
-- service_role bypasses RLS, so server functions using the admin client can write.

CREATE INDEX IF NOT EXISTS payment_events_org_id_created_at_idx
  ON public.payment_events (org_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_stripe_event_id_key
  ON public.payment_events (stripe_event_id) WHERE stripe_event_id IS NOT NULL;
