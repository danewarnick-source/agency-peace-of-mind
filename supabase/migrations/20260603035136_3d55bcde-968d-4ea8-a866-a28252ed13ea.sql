-- Tier 0.3: Scope client-documents storage to the owning organization.
-- Path layout is {organization_id}/{client_id}/{filename}.

DROP POLICY IF EXISTS "authenticated upload client documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update client documents" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete client documents" ON storage.objects;
DROP POLICY IF EXISTS "org members read client documents storage" ON storage.objects;

CREATE POLICY "client-documents: org members can read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-documents'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "client-documents: admins/managers can upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-documents'
  AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "client-documents: admins/managers can update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'client-documents'
  AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'client-documents'
  AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "client-documents: admins/managers can delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client-documents'
  AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
);
