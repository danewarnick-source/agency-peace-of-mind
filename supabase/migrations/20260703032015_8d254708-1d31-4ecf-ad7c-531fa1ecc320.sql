
CREATE TABLE public.requirement_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  satisfied_by TEXT NOT NULL DEFAULT 'unbound'
    CHECK (satisfied_by IN ('auto','form','credential','training','upload','attestation','unbound')),
  native_feature TEXT NULL,
  engine_ref TEXT NULL,
  notes TEXT NULL,
  bound_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requirement_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.requirement_bindings TO authenticated;
GRANT ALL ON public.requirement_bindings TO service_role;

ALTER TABLE public.requirement_bindings ENABLE ROW LEVEL SECURITY;

-- Org members can read bindings for requirements in their org.
CREATE POLICY "Org members can read requirement bindings"
ON public.requirement_bindings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.nectar_requirements r
    WHERE r.id = requirement_bindings.requirement_id
      AND public.is_org_member(r.organization_id, auth.uid())
  )
);

-- Admin / manager / super_admin can write bindings for their org's requirements.
CREATE POLICY "Admins can insert requirement bindings"
ON public.requirement_bindings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nectar_requirements r
    WHERE r.id = requirement_bindings.requirement_id
      AND (
        public.has_org_role(r.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(r.organization_id, auth.uid(), 'super_admin'::app_role)
        OR public.has_org_role(r.organization_id, auth.uid(), 'manager'::app_role)
        OR public.is_hive_executive(auth.uid())
      )
  )
);

CREATE POLICY "Admins can update requirement bindings"
ON public.requirement_bindings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.nectar_requirements r
    WHERE r.id = requirement_bindings.requirement_id
      AND (
        public.has_org_role(r.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(r.organization_id, auth.uid(), 'super_admin'::app_role)
        OR public.has_org_role(r.organization_id, auth.uid(), 'manager'::app_role)
        OR public.is_hive_executive(auth.uid())
      )
  )
);

CREATE POLICY "Admins can delete requirement bindings"
ON public.requirement_bindings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.nectar_requirements r
    WHERE r.id = requirement_bindings.requirement_id
      AND (
        public.has_org_role(r.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(r.organization_id, auth.uid(), 'super_admin'::app_role)
        OR public.is_hive_executive(auth.uid())
      )
  )
);

CREATE INDEX idx_requirement_bindings_requirement ON public.requirement_bindings(requirement_id);

CREATE TRIGGER requirement_bindings_set_updated_at
BEFORE UPDATE ON public.requirement_bindings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
