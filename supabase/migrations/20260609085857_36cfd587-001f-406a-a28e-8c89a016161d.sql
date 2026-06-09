
-- Drop the prior import-documents storage policies that assumed folder[1] = org_id
DROP POLICY IF EXISTS "import-documents admin write" ON storage.objects;
DROP POLICY IF EXISTS "import-documents admin read" ON storage.objects;
DROP POLICY IF EXISTS "import-documents admin update" ON storage.objects;
DROP POLICY IF EXISTS "import-documents admin delete" ON storage.objects;

-- New policies: gate on can_access_import_job() against the job-id folder segment.
-- Path convention: "<org_id>/<job_id>/<filename>" — folder[2] is the job id.
CREATE POLICY "import-documents: job-scoped upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'import-documents'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND public.can_access_import_job(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "import-documents: job-scoped read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'import-documents'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND public.can_access_import_job(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "import-documents: job-scoped update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'import-documents'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND public.can_access_import_job(((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'import-documents'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND public.can_access_import_job(((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "import-documents: job-scoped delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'import-documents'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND public.can_access_import_job(((storage.foldername(name))[2])::uuid)
  );
