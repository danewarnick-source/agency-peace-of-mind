
INSERT INTO storage.buckets (id, name, public)
VALUES ('client_receipt_snapshots', 'client_receipt_snapshots', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members can read receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client_receipt_snapshots'
  AND public.is_org_member( ((storage.foldername(name))[1])::uuid, auth.uid() )
);

CREATE POLICY "Org members can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client_receipt_snapshots'
  AND public.is_org_member( ((storage.foldername(name))[1])::uuid, auth.uid() )
);

CREATE POLICY "Org members can update receipts"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'client_receipt_snapshots'
  AND public.is_org_member( ((storage.foldername(name))[1])::uuid, auth.uid() )
);

CREATE POLICY "Org admins can delete receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client_receipt_snapshots'
  AND public.is_org_admin_or_manager( ((storage.foldername(name))[1])::uuid, auth.uid() )
);
