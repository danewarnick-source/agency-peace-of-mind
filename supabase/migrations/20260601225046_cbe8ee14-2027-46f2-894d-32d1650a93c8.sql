
CREATE TABLE public.provider_authorized_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'dormant' CHECK (status IN ('active','dormant')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('contract','sow','addendum','manual','inferred')),
  source_document_id UUID REFERENCES public.nectar_documents(id) ON DELETE SET NULL,
  notes TEXT,
  added_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX idx_provider_authorized_codes_org ON public.provider_authorized_codes (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_authorized_codes TO authenticated;
GRANT ALL ON public.provider_authorized_codes TO service_role;

ALTER TABLE public.provider_authorized_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read authorized codes"
  ON public.provider_authorized_codes FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins manage authorized codes insert"
  ON public.provider_authorized_codes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "admins manage authorized codes update"
  ON public.provider_authorized_codes FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "admins manage authorized codes delete"
  ON public.provider_authorized_codes FOR DELETE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER provider_authorized_codes_set_updated_at
BEFORE UPDATE ON public.provider_authorized_codes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
