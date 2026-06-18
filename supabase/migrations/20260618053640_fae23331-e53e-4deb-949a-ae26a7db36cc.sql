
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS billing_sms_phone text;

ALTER TABLE public.payment_events DROP CONSTRAINT IF EXISTS payment_events_event_type_check;
ALTER TABLE public.payment_events ADD CONSTRAINT payment_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_succeeded','payment_failed','payment_retried','card_expiry_warning',
    'account_locked','account_unlocked','payment_method_updated','subscription_cancelled',
    'stripe_webhook_received','sms_sent'
  ]));
