
CREATE TABLE public.contractor_monthly_pay (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  additional_pay numeric(12,2) NOT NULL DEFAULT 0,
  net_pay numeric(12,2) NOT NULL DEFAULT 0,
  tax_federal numeric(12,2) NOT NULL DEFAULT 0,
  tax_state numeric(12,2) NOT NULL DEFAULT 0,
  tax_fica numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, staff_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_monthly_pay TO authenticated;
GRANT ALL ON public.contractor_monthly_pay TO service_role;
ALTER TABLE public.contractor_monthly_pay ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contractor_pay admins read"
  ON public.contractor_monthly_pay FOR SELECT TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "contractor_pay admins write"
  ON public.contractor_monthly_pay FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE TRIGGER trg_contractor_pay_updated
  BEFORE UPDATE ON public.contractor_monthly_pay
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
