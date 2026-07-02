
CREATE TABLE public.employee_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  title TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  nectar_status TEXT NOT NULL DEFAULT 'pending',
  nectar_last_run_at TIMESTAMPTZ,
  nectar_applied_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  nectar_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX employee_documents_org_staff_idx
  ON public.employee_documents(organization_id, staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_documents_select_org_members"
  ON public.employee_documents FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "employee_documents_insert_admins"
  ON public.employee_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "employee_documents_update_admins"
  ON public.employee_documents FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "employee_documents_delete_admins"
  ON public.employee_documents FOR DELETE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_documents_set_updated_at ON public.employee_documents;
CREATE TRIGGER employee_documents_set_updated_at
  BEFORE UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "employee_docs_select_org_members" ON storage.objects;
CREATE POLICY "employee_docs_select_org_members"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "employee_docs_insert_admins" ON storage.objects;
CREATE POLICY "employee_docs_insert_admins"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-docs'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "employee_docs_update_admins" ON storage.objects;
CREATE POLICY "employee_docs_update_admins"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "employee_docs_delete_admins" ON storage.objects;
CREATE POLICY "employee_docs_delete_admins"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'employee-docs'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );
