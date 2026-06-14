
CREATE TABLE IF NOT EXISTS public.client_progress_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_kind text NOT NULL CHECK (period_kind IN ('quarterly','monthly')),
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  service_codes text[] NOT NULL DEFAULT '{}',
  requires_upi_attestation boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  upi_entered_at timestamptz,
  upi_entered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, period_kind, period_label)
);

CREATE INDEX IF NOT EXISTS idx_cps_org_due ON public.client_progress_summaries (organization_id, due_date) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cps_client ON public.client_progress_summaries (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_progress_summaries TO authenticated;
GRANT ALL ON public.client_progress_summaries TO service_role;

ALTER TABLE public.client_progress_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view client progress summaries"
  ON public.client_progress_summaries FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org admins manage client progress summaries insert"
  ON public.client_progress_summaries FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "org admins manage client progress summaries update"
  ON public.client_progress_summaries FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "org admins manage client progress summaries delete"
  ON public.client_progress_summaries FOR DELETE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_cps_updated_at ON public.client_progress_summaries;
CREATE TRIGGER update_cps_updated_at
  BEFORE UPDATE ON public.client_progress_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
