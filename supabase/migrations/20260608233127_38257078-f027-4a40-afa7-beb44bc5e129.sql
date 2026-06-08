
CREATE TABLE public.client_specific_trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Client-Specific Training',
  content jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  attestation_statement text NOT NULL DEFAULT 'I have reviewed and understand this client''s documented needs as presented above.',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  version integer NOT NULL DEFAULT 1,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cst_unique_client ON public.client_specific_trainings(client_id);
CREATE INDEX cst_org_idx ON public.client_specific_trainings(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_specific_trainings TO authenticated;
GRANT ALL ON public.client_specific_trainings TO service_role;

ALTER TABLE public.client_specific_trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage client specific trainings"
  ON public.client_specific_trainings
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER update_client_specific_trainings_updated_at
  BEFORE UPDATE ON public.client_specific_trainings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
