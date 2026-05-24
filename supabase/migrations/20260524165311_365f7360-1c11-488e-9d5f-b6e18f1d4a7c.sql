
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('employee','client')),
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('text','number','boolean','date')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(organization_id, entity_kind, field_key)
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read cfd" ON public.custom_field_definitions
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write cfd" ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('employee','client')),
  entity_id UUID NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(definition_id, entity_id)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read cfv" ON public.custom_field_values
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write cfv" ON public.custom_field_values
  FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_cfv_entity ON public.custom_field_values(entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS idx_cfd_org_kind ON public.custom_field_definitions(organization_id, entity_kind);
