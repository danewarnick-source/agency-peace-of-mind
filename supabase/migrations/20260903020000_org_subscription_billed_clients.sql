-- High-water client billing snapshot on org_subscriptions.
-- Count lives in the app (clients.created_at + clients.discharge_date).
-- These columns store the last applied count / unused prepaid credit.
-- No PHI. Existing org_subscriptions RLS stays in place.

ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS billed_client_count integer;

ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS billed_period_start date;

ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS billed_period_end date;

ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_credit_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.org_subscriptions.billed_client_count IS
  'Last high-water client count applied to Stripe. Not PHI.';
COMMENT ON COLUMN public.org_subscriptions.renewal_credit_cents IS
  'Unused prepaid client dollars applied at renewal. No cash refund.';
