
CREATE POLICY "hhc_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'host-home-certificates'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "hhc_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'host-home-certificates'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "hhc_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'host-home-certificates'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "hhc_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'host-home-certificates'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );
