
-- Part 1: NECTAR-proposed staff types per org (state-agnostic, derived from sources).
-- Applies-to-staff-types mapping for each requirement is stored in nectar_requirements.metadata
-- so this migration only adds the new staff_types table. No changes to existing data/logic.

CREATE TABLE public.staff_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  source_basis text,
  proposed_by text NOT NULL DEFAULT 'nectar' CHECK (proposed_by IN ('nectar','admin')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_types TO authenticated;
GRANT ALL ON public.staff_types TO service_role;

ALTER TABLE public.staff_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read staff_types"
  ON public.staff_types FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admin/manager insert staff_types"
  ON public.staff_types FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admin/manager update staff_types"
  ON public.staff_types FOR UPDATE TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admin delete staff_types"
  ON public.staff_types FOR DELETE TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER staff_types_set_updated_at
  BEFORE UPDATE ON public.staff_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
