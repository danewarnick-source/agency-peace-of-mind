
CREATE TABLE public.client_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_text text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_client_recipes_org ON public.client_recipes(organization_id);
CREATE INDEX ix_client_recipes_client ON public.client_recipes(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_recipes TO authenticated;
GRANT ALL ON public.client_recipes TO service_role;
ALTER TABLE public.client_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read recipes"
  ON public.client_recipes FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers write recipes"
  ON public.client_recipes FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_client_recipes_updated_at
  BEFORE UPDATE ON public.client_recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.client_recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.client_recipes(id) ON DELETE CASCADE,
  item text NOT NULL,
  quantity text,
  estimated_cost numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_recipe_ingredients_recipe ON public.client_recipe_ingredients(recipe_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_recipe_ingredients TO authenticated;
GRANT ALL ON public.client_recipe_ingredients TO service_role;
ALTER TABLE public.client_recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read recipe ingredients"
  ON public.client_recipe_ingredients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_recipes r
    WHERE r.id = recipe_id AND public.is_org_member(r.organization_id, auth.uid())
  ));
CREATE POLICY "managers write recipe ingredients"
  ON public.client_recipe_ingredients FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_recipes r
    WHERE r.id = recipe_id AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_recipes r
    WHERE r.id = recipe_id AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
  ));

CREATE TABLE public.org_shopping_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item text NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_org_shopping_library_item
  ON public.org_shopping_library(organization_id, lower(item));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_shopping_library TO authenticated;
GRANT ALL ON public.org_shopping_library TO service_role;
ALTER TABLE public.org_shopping_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read shopping library"
  ON public.org_shopping_library FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers write shopping library"
  ON public.org_shopping_library FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

ALTER TABLE public.client_meals
  ADD COLUMN recipe_id uuid REFERENCES public.client_recipes(id) ON DELETE SET NULL,
  ADD COLUMN estimated_cost numeric;
CREATE INDEX ix_client_meals_recipe ON public.client_meals(recipe_id);
