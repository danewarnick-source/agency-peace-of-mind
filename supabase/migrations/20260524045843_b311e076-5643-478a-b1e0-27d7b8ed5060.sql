
CREATE TABLE public.compliance_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  gap_type TEXT NOT NULL,
  gap_reference_date DATE NOT NULL,
  gap_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_overrides_org_staff ON public.compliance_overrides(organization_id, staff_id);
ALTER TABLE public.compliance_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers manage overrides" ON public.compliance_overrides
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "staff read own overrides" ON public.compliance_overrides
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid());

CREATE TABLE public.staff_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  gap_type TEXT NOT NULL,
  gap_reference_date DATE,
  gap_key TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'urgent',
  read_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_nudges_org_staff ON public.staff_nudges(organization_id, staff_id);
ALTER TABLE public.staff_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers manage nudges" ON public.staff_nudges
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "staff read own nudges" ON public.staff_nudges
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid());

CREATE POLICY "staff update own nudges" ON public.staff_nudges
  FOR UPDATE TO authenticated
  USING (staff_id = auth.uid())
  WITH CHECK (staff_id = auth.uid());
