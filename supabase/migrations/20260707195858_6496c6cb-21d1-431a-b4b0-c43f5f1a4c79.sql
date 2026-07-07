
-- 1) Per-client nutrition metric config
CREATE TABLE public.client_nutrition_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nutrition_label TEXT NOT NULL DEFAULT 'Fat Grams',
  nutrition_unit TEXT NOT NULL DEFAULT 'g',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

-- 2) Weekly plan header
CREATE TABLE public.client_meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  food_likes TEXT,
  foods_to_avoid TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_start_date)
);
CREATE INDEX client_meal_plans_client_idx ON public.client_meal_plans(client_id, week_start_date DESC);

-- 3) Meal entries in the 7×4 grid (multiple entries per cell)
CREATE TABLE public.client_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.client_meal_plans(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon .. 6=Sun
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','snack')),
  label TEXT NOT NULL DEFAULT '',
  description TEXT,
  nutrition_value NUMERIC(10,2),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_meals_plan_idx ON public.client_meals(meal_plan_id, day_of_week, meal_slot, sort_order);

-- 4) Manual shopping list
CREATE TABLE public.client_shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.client_meal_plans(id) ON DELETE CASCADE,
  item TEXT NOT NULL DEFAULT '',
  quantity TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_shopping_items_plan_idx ON public.client_shopping_items(meal_plan_id, sort_order);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_nutrition_config TO authenticated;
GRANT ALL ON public.client_nutrition_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meal_plans TO authenticated;
GRANT ALL ON public.client_meal_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meals TO authenticated;
GRANT ALL ON public.client_meals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_shopping_items TO authenticated;
GRANT ALL ON public.client_shopping_items TO service_role;

-- RLS
ALTER TABLE public.client_nutrition_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_shopping_items ENABLE ROW LEVEL SECURITY;

-- nutrition_config policies
CREATE POLICY "Org members view nutrition config" ON public.client_nutrition_config
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Managers insert nutrition config" ON public.client_nutrition_config
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "Managers update nutrition config" ON public.client_nutrition_config
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "Managers delete nutrition config" ON public.client_nutrition_config
  FOR DELETE TO authenticated USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- meal_plans policies
CREATE POLICY "Org members view meal plans" ON public.client_meal_plans
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Managers insert meal plans" ON public.client_meal_plans
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "Managers update meal plans" ON public.client_meal_plans
  FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "Managers delete meal plans" ON public.client_meal_plans
  FOR DELETE TO authenticated USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- meals policies (via parent plan)
CREATE POLICY "Org members view meals" ON public.client_meals
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meals.meal_plan_id
      AND public.is_org_member(p.organization_id, auth.uid())
  ));
CREATE POLICY "Managers insert meals" ON public.client_meals
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meals.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));
CREATE POLICY "Managers update meals" ON public.client_meals
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meals.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meals.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));
CREATE POLICY "Managers delete meals" ON public.client_meals
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_meals.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));

-- shopping_items policies (via parent plan)
CREATE POLICY "Org members view shopping items" ON public.client_shopping_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_shopping_items.meal_plan_id
      AND public.is_org_member(p.organization_id, auth.uid())
  ));
CREATE POLICY "Managers insert shopping items" ON public.client_shopping_items
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_shopping_items.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));
CREATE POLICY "Managers update shopping items" ON public.client_shopping_items
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_shopping_items.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_shopping_items.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));
CREATE POLICY "Managers delete shopping items" ON public.client_shopping_items
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.client_meal_plans p
    WHERE p.id = client_shopping_items.meal_plan_id
      AND public.is_org_admin_or_manager(p.organization_id, auth.uid())
  ));

-- Touch triggers (reuse existing generic function if present)
CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER client_nutrition_config_touch BEFORE UPDATE ON public.client_nutrition_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER client_meal_plans_touch BEFORE UPDATE ON public.client_meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER client_meals_touch BEFORE UPDATE ON public.client_meals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
CREATE TRIGGER client_shopping_items_touch BEFORE UPDATE ON public.client_shopping_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_generic();
