-- Tier 0.4: Scope nectar-documents write/update/delete to org admins/managers.
-- SELECT policy is already correctly scoped via the nectar_documents join; left untouched.

DROP POLICY IF EXISTS "nectar docs write for admins"  ON storage.objects;
DROP POLICY IF EXISTS "nectar docs update for admins" ON storage.objects;
DROP POLICY IF EXISTS "nectar docs delete for admins" ON storage.objects;

CREATE POLICY "nectar docs insert for org admins"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nectar-documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "nectar docs update for org admins"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nectar-documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'nectar-documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "nectar docs delete for org admins"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nectar-documents'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);