
-- client_target_behaviors: per-client list of named target behaviors for
-- behavior observation documentation. Admins define them; all org members
-- can read them (needed in the staff clock-out flow).

CREATE TABLE public.client_target_behaviors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        NOT NULL REFERENCES public.clients(id)       ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  behavior_name   text        NOT NULL CHECK (char_length(behavior_name) BETWEEN 1 AND 200),
  description     text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_target_behaviors TO authenticated;
GRANT ALL                            ON public.client_target_behaviors TO service_role;

ALTER TABLE public.client_target_behaviors ENABLE ROW LEVEL SECURITY;

-- All org members read (staff need this during clock-out)
CREATE POLICY "ctb_read" ON public.client_target_behaviors
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- Only admins/managers can write
CREATE POLICY "ctb_write" ON public.client_target_behaviors
  FOR ALL TO authenticated
  USING  (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_ctb_updated
  BEFORE UPDATE ON public.client_target_behaviors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ctb_client ON public.client_target_behaviors(client_id);
CREATE INDEX idx_ctb_org    ON public.client_target_behaviors(organization_id);
