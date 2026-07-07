
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS needs_shopping_help BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.client_meal_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.client_meal_plans(id) ON DELETE CASCADE,
  actual_date DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','snack')),
  outcome TEXT NOT NULL CHECK (outcome IN ('ate_as_planned','swapped_from_another_day','ate_out','changed_entirely')),
  note TEXT,
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meal_plan_id, actual_date, meal_slot)
);
CREATE INDEX client_meal_actuals_plan_idx ON public.client_meal_actuals(meal_plan_id, actual_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meal_actuals TO authenticated;
GRANT ALL ON public.client_meal_actuals TO service_role;

ALTER TABLE public.client_meal_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view meal actuals" ON public.client_meal_actuals
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND public.is_org_member(p.organization_id, auth.uid())
  ));

CREATE POLICY "Org members insert meal actuals" ON public.client_meal_actuals
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND public.is_org_member(p.organization_id, auth.uid())
  ));

CREATE POLICY "Org members update meal actuals" ON public.client_meal_actuals
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND public.is_org_member(p.organization_id, auth.uid())
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND public.is_org_member(p.organization_id, auth.uid())
  ));

CREATE POLICY "Managers delete meal actuals" ON public.client_meal_actuals
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meal_actuals.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));

CREATE TRIGGER client_meal_actuals_touch BEFORE UPDATE ON public.client_meal_actuals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
