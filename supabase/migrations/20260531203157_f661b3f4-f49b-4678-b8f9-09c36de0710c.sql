-- Client workspace: add missing profile columns
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS special_directions      text,
  ADD COLUMN IF NOT EXISTS date_of_birth           date,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS feature_config          jsonb;

-- HIPAA-compliant document storage table
CREATE TABLE IF NOT EXISTS public.client_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name        text NOT NULL,
  document_type    text NOT NULL,
  file_url         text NOT NULL,
  storage_path     text,
  file_size_bytes  integer,
  uploaded_by      uuid,
  uploaded_by_name text,
  uploaded_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read documents"
  ON public.client_documents FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage documents"
  ON public.client_documents FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_client_documents_client
  ON public.client_documents (client_id);

-- Storage bucket for client documents (private, 20 MB cap)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org members read client documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'client-documents');

CREATE POLICY "authenticated upload client documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "authenticated update client documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-documents');

CREATE POLICY "authenticated delete client documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-documents');
