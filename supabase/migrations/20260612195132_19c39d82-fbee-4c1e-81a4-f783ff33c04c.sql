-- CRM Phase C3: client discharge flow per SOW §1.22

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_account_status_chk;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_account_status_chk
  CHECK (account_status = ANY (ARRAY['active'::text, 'archived'::text, 'discharged'::text]));

CREATE TABLE public.client_discharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  discharge_date date NOT NULL,
  discharge_reason text NOT NULL CHECK (length(discharge_reason) BETWEEN 1 AND 4000),
  initiated_by text NOT NULL CHECK (initiated_by IN ('contractor', 'person')),
  attested_items jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_document_id uuid REFERENCES public.nectar_documents(id) ON DELETE SET NULL,
  source_citation text NOT NULL,
  source_excerpt text NOT NULL,
  additional_notes text,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  prior_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL
);

CREATE INDEX idx_client_discharges_org_client
  ON public.client_discharges (organization_id, client_id, discharge_date DESC);

GRANT SELECT, INSERT ON public.client_discharges TO authenticated;
GRANT ALL ON public.client_discharges TO service_role;

ALTER TABLE public.client_discharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read client_discharges"
  ON public.client_discharges
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "manage_referrals can insert client_discharges"
  ON public.client_discharges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), organization_id, 'manage_referrals')
    AND recorded_by = auth.uid()
  );

COMMENT ON TABLE public.client_discharges IS
  'Append-only audit log of client discharges. Steps + citation are sourced from the SOW (DHHS91172 §1.22) at time of discharge — see source_document_id / source_excerpt / source_citation.';
