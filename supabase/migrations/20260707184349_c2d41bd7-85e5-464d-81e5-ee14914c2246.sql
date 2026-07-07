
CREATE TABLE public.client_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  details TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, period_month)
);
CREATE INDEX client_budgets_client_idx ON public.client_budgets(client_id, period_month DESC);

CREATE TABLE public.client_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.client_budgets(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('income','expense','other')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  non_variable NUMERIC(12,2) NOT NULL DEFAULT 0,
  variable NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_budget_lines_budget_idx ON public.client_budget_lines(budget_id, section, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_budgets TO authenticated;
GRANT ALL ON public.client_budgets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_budget_lines TO authenticated;
GRANT ALL ON public.client_budget_lines TO service_role;

ALTER TABLE public.client_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view client budgets"
  ON public.client_budgets FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Managers can insert client budgets"
  ON public.client_budgets FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Managers can update client budgets"
  ON public.client_budgets FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Managers can delete client budgets"
  ON public.client_budgets FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org members can view budget lines"
  ON public.client_budget_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_budgets b
    WHERE b.id = client_budget_lines.budget_id
      AND public.is_org_member(b.organization_id, auth.uid())
  ));

CREATE POLICY "Managers can insert budget lines"
  ON public.client_budget_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_budgets b
    WHERE b.id = client_budget_lines.budget_id
      AND public.is_org_admin_or_manager(b.organization_id, auth.uid())
  ));

CREATE POLICY "Managers can update budget lines"
  ON public.client_budget_lines FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_budgets b
    WHERE b.id = client_budget_lines.budget_id
      AND public.is_org_admin_or_manager(b.organization_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_budgets b
    WHERE b.id = client_budget_lines.budget_id
      AND public.is_org_admin_or_manager(b.organization_id, auth.uid())
  ));

CREATE POLICY "Managers can delete budget lines"
  ON public.client_budget_lines FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_budgets b
    WHERE b.id = client_budget_lines.budget_id
      AND public.is_org_admin_or_manager(b.organization_id, auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_budgets_touch BEFORE UPDATE ON public.client_budgets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER client_budget_lines_touch BEFORE UPDATE ON public.client_budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
