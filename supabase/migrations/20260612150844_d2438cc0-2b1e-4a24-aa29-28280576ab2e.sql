
-- 1. Sparse-valid + notes
ALTER TABLE public.referrals
  ALTER COLUMN category DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2. Referral documents table
CREATE TABLE IF NOT EXISTS public.referral_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.referrals(id) ON DELETE CASCADE,
  draft_key text,
  storage_bucket text NOT NULL DEFAULT 'referral-documents',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer,
  parse_status text NOT NULL DEFAULT 'pending', -- pending | parsed | failed | skipped
  parse_error text,
  parsed_fields jsonb,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_documents TO authenticated;
GRANT ALL ON public.referral_documents TO service_role;

ALTER TABLE public.referral_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_documents managers select"
  ON public.referral_documents FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id));

CREATE POLICY "referral_documents managers insert"
  ON public.referral_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(auth.uid(), organization_id));

CREATE POLICY "referral_documents managers update"
  ON public.referral_documents FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin_or_manager(auth.uid(), organization_id));

CREATE POLICY "referral_documents managers delete"
  ON public.referral_documents FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS referral_documents_org_ref_idx
  ON public.referral_documents (organization_id, referral_id);
CREATE INDEX IF NOT EXISTS referral_documents_draft_idx
  ON public.referral_documents (organization_id, draft_key)
  WHERE draft_key IS NOT NULL;

-- 3. Storage RLS for referral-documents bucket.
-- Path convention: {organization_id}/{referral_id|draft-{uuid}}/{filename}
-- First path segment must be a UUID matching an org where caller is admin/manager.

CREATE POLICY "referral-documents managers read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'referral-documents'
    AND public.is_org_admin_or_manager(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "referral-documents managers upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'referral-documents'
    AND public.is_org_admin_or_manager(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );

CREATE POLICY "referral-documents managers delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'referral-documents'
    AND public.is_org_admin_or_manager(
      auth.uid(),
      NULLIF(split_part(name, '/', 1), '')::uuid
    )
  );
