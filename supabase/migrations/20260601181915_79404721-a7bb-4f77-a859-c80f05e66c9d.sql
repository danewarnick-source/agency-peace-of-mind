
CREATE TABLE public.nectar_guides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  goal TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  surface TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.nectar_guide_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guide_id UUID NOT NULL REFERENCES public.nectar_guides(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  why TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_step INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nectar_guides_user ON public.nectar_guides (user_id, status);
CREATE INDEX idx_nectar_guide_tasks_guide ON public.nectar_guide_tasks (guide_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_guides TO authenticated;
GRANT ALL ON public.nectar_guides TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_guide_tasks TO authenticated;
GRANT ALL ON public.nectar_guide_tasks TO service_role;

ALTER TABLE public.nectar_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nectar_guide_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can view own guides" ON public.nectar_guides
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner can insert own guides" ON public.nectar_guides
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND public.is_org_member(organization_id, auth.uid())
  );
CREATE POLICY "owner can update own guides" ON public.nectar_guides
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner can delete own guides" ON public.nectar_guides
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "owner can view own guide tasks" ON public.nectar_guide_tasks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner can insert own guide tasks" ON public.nectar_guide_tasks
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND public.is_org_member(organization_id, auth.uid())
  );
CREATE POLICY "owner can update own guide tasks" ON public.nectar_guide_tasks
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "owner can delete own guide tasks" ON public.nectar_guide_tasks
  FOR DELETE TO authenticated USING (user_id = auth.uid());
