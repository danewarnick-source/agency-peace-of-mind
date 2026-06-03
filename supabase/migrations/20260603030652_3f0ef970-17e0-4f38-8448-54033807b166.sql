
-- Tier 0.2: Lock down client-photos bucket. Scope all ops by org membership
-- derived from the storage path: {organization_id}/{client_id}/...

DROP POLICY IF EXISTS "client-photos public read"           ON storage.objects;
DROP POLICY IF EXISTS "client-photos authenticated write"   ON storage.objects;
DROP POLICY IF EXISTS "client-photos authenticated update"  ON storage.objects;
DROP POLICY IF EXISTS "client-photos authenticated delete"  ON storage.objects;

-- SELECT: any active member of the owning org may read
CREATE POLICY "client-photos org members read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-photos'
  AND public.is_org_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- INSERT: only admins/managers of the owning org may upload
CREATE POLICY "client-photos org admins insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-photos'
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- UPDATE: only admins/managers of the owning org may overwrite
CREATE POLICY "client-photos org admins update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-photos'
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'client-photos'
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- DELETE: only admins/managers of the owning org may delete
CREATE POLICY "client-photos org admins delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-photos'
  AND public.is_org_admin_or_manager(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);
