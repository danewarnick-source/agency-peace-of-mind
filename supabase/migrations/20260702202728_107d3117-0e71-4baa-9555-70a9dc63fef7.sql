
DO $$ BEGIN
  CREATE TYPE public.hive_training_auto_renew_scope AS ENUM ('all', 'full_program', 'selected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hive_training_auto_renew_status AS ENUM ('succeeded', 'card_failed', 'no_eligible', 'partial', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.hive_training_auto_renew_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  lead_days integer NOT NULL DEFAULT 45 CHECK (lead_days IN (30, 45, 60, 90)),
  scope public.hive_training_auto_renew_scope NOT NULL DEFAULT 'all',
  selected_catalog_ids uuid[] NOT NULL DEFAULT '{}',
  stripe_customer_id text,
  stripe_payment_method_id text,
  payment_method_last4 text,
  payment_method_brand text,
  last_run_at timestamptz,
  paused_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_training_auto_renew_settings TO authenticated;
GRANT ALL ON public.hive_training_auto_renew_settings TO service_role;

ALTER TABLE public.hive_training_auto_renew_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage auto-renew settings"
  ON public.hive_training_auto_renew_settings
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Service role full access auto-renew settings"
  ON public.hive_training_auto_renew_settings
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_hive_training_auto_renew_settings_updated_at
  BEFORE UPDATE ON public.hive_training_auto_renew_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.hive_training_auto_renew_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  staff_count integer NOT NULL DEFAULT 0,
  seats_purchased integer NOT NULL DEFAULT 0,
  total_amount_cents integer NOT NULL DEFAULT 0,
  stripe_payment_intent_id text,
  status public.hive_training_auto_renew_status NOT NULL,
  error_message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hive_auto_renew_runs_org ON public.hive_training_auto_renew_runs(organization_id, run_at DESC);

GRANT SELECT ON public.hive_training_auto_renew_runs TO authenticated;
GRANT ALL ON public.hive_training_auto_renew_runs TO service_role;

ALTER TABLE public.hive_training_auto_renew_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read auto-renew runs"
  ON public.hive_training_auto_renew_runs
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Service role full access auto-renew runs"
  ON public.hive_training_auto_renew_runs
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
