
-- Audit Zone: monthly audit files + attached supporting documents

CREATE TABLE public.audit_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  period_month DATE NOT NULL, -- first day of the month this audit file covers
  status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building','review_complete','sent_to_audit')),
  notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  sent_to_audit_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_files TO authenticated;
GRANT ALL ON public.audit_files TO service_role;

ALTER TABLE public.audit_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit files"
  ON public.audit_files FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can insert audit files"
  ON public.audit_files FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can update audit files"
  ON public.audit_files FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins can delete audit files"
  ON public.audit_files FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_audit_files_updated_at
  BEFORE UPDATE ON public.audit_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Documents attached to an audit file (either auto-pulled or user-uploaded)
CREATE TABLE public.audit_file_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_file_id UUID NOT NULL REFERENCES public.audit_files(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto','upload')),
  category TEXT, -- e.g. 'evv','timesheets','billing','client','staff','incident','other'
  title TEXT NOT NULL,
  storage_path TEXT, -- path in audit-documents bucket (uploaded)
  external_ref TEXT, -- reference id for auto-pulled records
  mime_type TEXT,
  size_bytes BIGINT,
  added_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_file_documents TO authenticated;
GRANT ALL ON public.audit_file_documents TO service_role;

ALTER TABLE public.audit_file_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit file documents"
  ON public.audit_file_documents FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can insert audit file documents"
  ON public.audit_file_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can delete audit file documents"
  ON public.audit_file_documents FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX idx_audit_files_org_month ON public.audit_files(organization_id, period_month DESC);
CREATE INDEX idx_audit_file_docs_file ON public.audit_file_documents(audit_file_id);

-- Storage bucket for uploaded audit documents (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-documents', 'audit-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members can read their audit documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audit-documents'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "Org admins/managers can upload audit documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audit-documents'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "Org admins/managers can delete audit documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'audit-documents'
    AND public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
  );
