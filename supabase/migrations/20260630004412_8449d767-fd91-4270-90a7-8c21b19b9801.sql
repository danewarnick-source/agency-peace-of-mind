
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.client_external_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_code text,
  provider_name text,
  note text,
  source text NOT NULL DEFAULT 'pcsp_import',
  import_subject_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_external_services_client_idx
  ON public.client_external_services (organization_id, client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_external_services TO authenticated;
GRANT ALL ON public.client_external_services TO service_role;

ALTER TABLE public.client_external_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read external services"
  ON public.client_external_services FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org admins manage external services"
  ON public.client_external_services FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_ces_updated_at ON public.client_external_services;
CREATE TRIGGER trg_ces_updated_at
  BEFORE UPDATE ON public.client_external_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
