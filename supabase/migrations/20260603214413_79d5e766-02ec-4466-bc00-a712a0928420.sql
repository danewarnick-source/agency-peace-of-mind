-- Path convention: {organization_id}/{staff_id}/...
-- staff_id is path token at index 2 (1-based: storage.foldername returns ['org', 'staff', ...])

DROP POLICY IF EXISTS "hr_docs storage select" ON storage.objects;
CREATE POLICY "hr_docs storage select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND public.can_view_staff_pii(
    (storage.foldername(name))[1]::uuid,
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "hr_docs storage insert" ON storage.objects;
CREATE POLICY "hr_docs storage insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hr-documents'
  AND public.can_view_staff_pii(
    (storage.foldername(name))[1]::uuid,
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "hr_docs storage delete" ON storage.objects;
CREATE POLICY "hr_docs storage delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND auth.uid() <> (storage.foldername(name))[2]::uuid
  AND public.can_view_staff_pii(
    (storage.foldername(name))[1]::uuid,
    (storage.foldername(name))[2]::uuid,
    auth.uid()
  )
);