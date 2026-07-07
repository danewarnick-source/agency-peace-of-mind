CREATE TABLE public.chore_daily_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.chore_spaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  detail text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chore_daily_items TO authenticated;
GRANT ALL ON public.chore_daily_items TO service_role;

ALTER TABLE public.chore_daily_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chore_daily_items_read" ON public.chore_daily_items FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_member(s.organization_id, auth.uid())));
CREATE POLICY "chore_daily_items_write" ON public.chore_daily_items FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())))
  WITH CHECK (EXISTS(SELECT 1 FROM public.chore_spaces s WHERE s.id = space_id AND public.is_org_admin_or_manager(s.organization_id, auth.uid())));

CREATE INDEX chore_daily_items_space_idx ON public.chore_daily_items(space_id, sort_order);

CREATE TRIGGER update_chore_daily_items_updated_at BEFORE UPDATE ON public.chore_daily_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();