
ALTER TABLE public.nectar_documents
  ADD COLUMN IF NOT EXISTS jurisdiction text;

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS jurisdiction text;

CREATE TABLE IF NOT EXISTS public.nectar_requirement_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requirement_id uuid NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('provider','code','role','client','unknown')),
  scope_value text,
  cadence text,
  jurisdiction text,
  proposed_by text NOT NULL DEFAULT 'nectar' CHECK (proposed_by IN ('nectar','admin')),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  rationale text,
  source_excerpt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nectar_req_map
  ON public.nectar_requirement_mappings (requirement_id, scope_kind, COALESCE(scope_value, ''));
CREATE INDEX IF NOT EXISTS idx_nectar_req_map_org
  ON public.nectar_requirement_mappings (organization_id);
CREATE INDEX IF NOT EXISTS idx_nectar_req_map_scope
  ON public.nectar_requirement_mappings (organization_id, scope_kind, scope_value);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_requirement_mappings TO authenticated;
GRANT ALL ON public.nectar_requirement_mappings TO service_role;

ALTER TABLE public.nectar_requirement_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view mappings"
  ON public.nectar_requirement_mappings FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins insert mappings"
  ON public.nectar_requirement_mappings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins update mappings"
  ON public.nectar_requirement_mappings FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins delete mappings"
  ON public.nectar_requirement_mappings FOR DELETE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_nectar_req_map_updated
  BEFORE UPDATE ON public.nectar_requirement_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
