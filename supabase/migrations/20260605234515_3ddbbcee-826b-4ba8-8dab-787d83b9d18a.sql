
DO $$ BEGIN
  CREATE TYPE public.provider_training_kind AS ENUM ('policies','person');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_training_status AS ENUM ('draft','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.provider_training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.provider_training_kind NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  person_label text,
  title text NOT NULL,
  intro text,
  est_min integer NOT NULL DEFAULT 10,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  attestation_statement text NOT NULL,
  status public.provider_training_status NOT NULL DEFAULT 'draft',
  source_doc_name text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_requires_client CHECK (kind <> 'person' OR client_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS provider_training_modules_org_kind_idx
  ON public.provider_training_modules(organization_id, kind, status);
CREATE INDEX IF NOT EXISTS provider_training_modules_client_idx
  ON public.provider_training_modules(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_training_modules TO authenticated;
GRANT ALL ON public.provider_training_modules TO service_role;

ALTER TABLE public.provider_training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage org training content"
  ON public.provider_training_modules
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "staff read published policies"
  ON public.provider_training_modules
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND kind = 'policies'
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "staff read published person modules if assigned"
  ON public.provider_training_modules
  FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND kind = 'person'
    AND client_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.staff_assignments sa
      WHERE sa.organization_id = provider_training_modules.organization_id
        AND sa.client_id = provider_training_modules.client_id
        AND sa.staff_id = auth.uid()
    )
  );

CREATE TRIGGER provider_training_modules_set_updated_at
  BEFORE UPDATE ON public.provider_training_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
