
-- Per-client authorized billing codes (the budget ledger)
CREATE TABLE IF NOT EXISTS public.client_billing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  unit_type text NOT NULL DEFAULT 'Q',
  rate_per_unit numeric(12,4) NOT NULL DEFAULT 0,
  annual_unit_authorization integer NOT NULL DEFAULT 0,
  monthly_max_units integer,
  weekly_cap_units integer,
  service_start_date date,
  service_end_date date,
  sce text,
  provider_approver_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, service_code)
);

CREATE INDEX IF NOT EXISTS idx_cbc_org_client ON public.client_billing_codes(organization_id, client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_billing_codes TO authenticated;
GRANT ALL ON public.client_billing_codes TO service_role;

ALTER TABLE public.client_billing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read client billing codes"
  ON public.client_billing_codes FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can write client billing codes"
  ON public.client_billing_codes FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_cbc_updated_at
  BEFORE UPDATE ON public.client_billing_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Cap behavior + warn threshold on org Time & Pay settings
ALTER TABLE public.time_pay_settings
  ADD COLUMN IF NOT EXISTS cap_behavior text NOT NULL DEFAULT 'acknowledge',
  ADD COLUMN IF NOT EXISTS cap_warn_pct integer NOT NULL DEFAULT 90;

ALTER TABLE public.time_pay_settings
  DROP CONSTRAINT IF EXISTS time_pay_settings_cap_behavior_chk;
ALTER TABLE public.time_pay_settings
  ADD CONSTRAINT time_pay_settings_cap_behavior_chk
  CHECK (cap_behavior IN ('warn','acknowledge','auto_clock_out'));
