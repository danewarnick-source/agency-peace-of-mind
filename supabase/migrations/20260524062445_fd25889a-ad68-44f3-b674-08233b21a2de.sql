
CREATE TABLE public.agency_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  mask TEXT NOT NULL,
  plaid_account_id TEXT,
  institution_logo TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by UUID
);
ALTER TABLE public.agency_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read agency banks" ON public.agency_bank_accounts FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write agency banks" ON public.agency_bank_accounts FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE TABLE public.agency_bank_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  bank_account_id UUID NOT NULL REFERENCES public.agency_bank_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id)
);
ALTER TABLE public.agency_bank_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read bank maps" ON public.agency_bank_mappings FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "managers write bank maps" ON public.agency_bank_mappings FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

ALTER TABLE public.pba_transactions
  ADD COLUMN IF NOT EXISTS auto_reconciled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT;
