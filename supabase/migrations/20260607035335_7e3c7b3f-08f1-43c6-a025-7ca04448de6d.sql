
-- Storage policies for bc-documents bucket
-- Path convention: {organization_id}/{client_id}/{doc_type}/{filename}

CREATE POLICY "bc_docs_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'bc-documents'
  AND EXISTS (
    SELECT 1 FROM public.bc_documents d
    WHERE d.storage_path = storage.objects.name
      AND EXISTS (
        SELECT 1 FROM public.behavior_support_clients bsc
        WHERE bsc.client_id = d.client_id AND bsc.features_enabled = true
      )
      AND (
        public.has_org_role(d.organization_id, auth.uid(), 'admin'::app_role)
        OR public.has_org_role(d.organization_id, auth.uid(), 'super_admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.behavior_support_clients bsc2
          WHERE bsc2.client_id = d.client_id AND bsc2.assigned_behaviorist_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.clients_for_staff(d.organization_id, auth.uid()) c
          WHERE c.id = d.client_id
        )
      )
  )
);

CREATE POLICY "bc_docs_write" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bc-documents'
  AND (
    -- Admins of the org segment in the path
    public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'admin'::app_role)
    OR public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.behavior_support_clients bsc
      WHERE bsc.client_id = (storage.foldername(name))[2]::uuid
        AND bsc.assigned_behaviorist_user_id = auth.uid()
    )
  )
);

CREATE POLICY "bc_docs_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'bc-documents'
  AND (
    public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'admin'::app_role)
    OR public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.behavior_support_clients bsc
      WHERE bsc.client_id = (storage.foldername(name))[2]::uuid
        AND bsc.assigned_behaviorist_user_id = auth.uid()
    )
  )
);

CREATE POLICY "bc_docs_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'bc-documents'
  AND (
    public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'admin'::app_role)
    OR public.has_org_role((storage.foldername(name))[1]::uuid, auth.uid(), 'super_admin'::app_role)
  )
);
