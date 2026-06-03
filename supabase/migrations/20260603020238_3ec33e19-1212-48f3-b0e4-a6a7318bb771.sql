-- Provider-entered ledger entries (Layer 2 of the Financial Revenue view).
-- Layer 1 (HIVE-verified billed revenue) stays sourced live from 520 data.
CREATE TABLE public.provider_ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  category TEXT NOT NULL CHECK (category IN ('expense','payroll_tax','estimated_payroll','received','custom')),
  label TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  is_estimate BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_ledger_org_period
  ON public.provider_ledger_entries (organization_id, period_year, period_month);

-- Data API grants. Auth-only table; all policies scope via auth.uid() -> no anon grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_ledger_entries TO authenticated;
GRANT ALL ON public.provider_ledger_entries TO service_role;

ALTER TABLE public.provider_ledger_entries ENABLE ROW LEVEL SECURITY;

-- SELECT: any active org member can read their org's ledger
CREATE POLICY "ledger_select_org_members"
ON public.provider_ledger_entries
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

-- INSERT: admin or super_admin of that org only
CREATE POLICY "ledger_insert_admins"
ON public.provider_ledger_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);

-- UPDATE: admin or super_admin only
CREATE POLICY "ledger_update_admins"
ON public.provider_ledger_entries
FOR UPDATE
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);

-- DELETE: admin or super_admin only
CREATE POLICY "ledger_delete_admins"
ON public.provider_ledger_entries
FOR DELETE
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);

CREATE TRIGGER trg_provider_ledger_updated_at
BEFORE UPDATE ON public.provider_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
