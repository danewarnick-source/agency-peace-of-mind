
CREATE TABLE public.client_staff_visibility (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_staff_visibility TO authenticated;
GRANT ALL ON public.client_staff_visibility TO service_role;

ALTER TABLE public.client_staff_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read client visibility"
ON public.client_staff_visibility FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org admins/managers write client visibility"
ON public.client_staff_visibility FOR ALL TO authenticated
USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS client_staff_visibility_org_idx
  ON public.client_staff_visibility(organization_id);
