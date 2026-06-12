
CREATE TABLE public.distribution_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('profit_share','investor','ownership')),
  retention_pct numeric(6,3) NOT NULL DEFAULT 0 CHECK (retention_pct >= 0 AND retention_pct <= 100),
  expense_selection jsonb NOT NULL DEFAULT '{"net_payroll":true,"additional_pay":true,"federal_tax":true,"state_tax":true,"fica":false}'::jsonb,
  formula_json jsonb,
  nectar_summary text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_plans TO authenticated;
GRANT ALL ON public.distribution_plans TO service_role;
ALTER TABLE public.distribution_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dist_plans_admin_select" ON public.distribution_plans FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));
CREATE POLICY "dist_plans_admin_write" ON public.distribution_plans FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_distribution_plans_updated_at
  BEFORE UPDATE ON public.distribution_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.distribution_plan_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.distribution_plans(id) ON DELETE CASCADE,
  participant_name text NOT NULL,
  participant_user_id uuid REFERENCES auth.users(id),
  allocation_pct numeric(7,4) NOT NULL DEFAULT 0 CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  role_label text,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_plan_participants TO authenticated;
GRANT ALL ON public.distribution_plan_participants TO service_role;
ALTER TABLE public.distribution_plan_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dist_part_admin_select" ON public.distribution_plan_participants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.distribution_plans p
    WHERE p.id = plan_id
      AND (public.has_org_role(p.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(p.organization_id, auth.uid(), 'manager'::app_role)
        OR public.has_org_role(p.organization_id, auth.uid(), 'super_admin'::app_role))));

CREATE POLICY "dist_part_admin_write" ON public.distribution_plan_participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.distribution_plans p
    WHERE p.id = plan_id
      AND (public.has_org_role(p.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(p.organization_id, auth.uid(), 'super_admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.distribution_plans p
    WHERE p.id = plan_id
      AND (public.has_org_role(p.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(p.organization_id, auth.uid(), 'super_admin'::app_role))));

CREATE TRIGGER trg_distribution_plan_participants_updated_at
  BEFORE UPDATE ON public.distribution_plan_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_dist_plans_org ON public.distribution_plans(organization_id);
CREATE INDEX idx_dist_part_plan ON public.distribution_plan_participants(plan_id);
