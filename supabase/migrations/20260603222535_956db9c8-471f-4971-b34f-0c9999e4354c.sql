
CREATE OR REPLACE FUNCTION public.can_view_client_intake(_org uuid, _client uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_org_role(_org, _viewer, 'admin'::app_role)
    OR public.has_org_role(_org, _viewer, 'super_admin'::app_role)
    OR public.is_hive_executive(_viewer)
    OR EXISTS (
      SELECT 1 FROM public.staff_assignments sa
       WHERE sa.organization_id = _org
         AND sa.client_id = _client
         AND sa.staff_id = _viewer
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_client_intake(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_hr_client_intake_base(_org uuid)
RETURNS SETOF public.nectar_requirements
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.nectar_requirements r
  WHERE r.organization_id = _org
    AND r.metadata->>'scope' = 'hr_client_intake'
    AND r.approval_state = 'provider_confirmed'
    AND public.is_org_member(_org, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_hr_client_intake_base(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.client_intake_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','complete','expired','waived','not_applicable')),
  completed_date date,
  expires_at date,
  evidence_document_id uuid REFERENCES public.nectar_documents(id) ON DELETE SET NULL,
  notes text,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS client_intake_completion_org_client_idx
  ON public.client_intake_completion(organization_id, client_id);
CREATE INDEX IF NOT EXISTS client_intake_completion_req_idx
  ON public.client_intake_completion(requirement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_intake_completion TO authenticated;
GRANT ALL ON public.client_intake_completion TO service_role;

ALTER TABLE public.client_intake_completion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cic read gated"
  ON public.client_intake_completion FOR SELECT TO authenticated
  USING (public.can_view_client_intake(organization_id, client_id, auth.uid()));

CREATE POLICY "cic insert gated"
  ON public.client_intake_completion FOR INSERT TO authenticated
  WITH CHECK (public.can_view_client_intake(organization_id, client_id, auth.uid()));

CREATE POLICY "cic update gated"
  ON public.client_intake_completion FOR UPDATE TO authenticated
  USING (public.can_view_client_intake(organization_id, client_id, auth.uid()))
  WITH CHECK (public.can_view_client_intake(organization_id, client_id, auth.uid()));

CREATE POLICY "cic delete gated"
  ON public.client_intake_completion FOR DELETE TO authenticated
  USING (public.can_view_client_intake(organization_id, client_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_client_intake_completion_updated ON public.client_intake_completion;
CREATE TRIGGER trg_client_intake_completion_updated
  BEFORE UPDATE ON public.client_intake_completion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
