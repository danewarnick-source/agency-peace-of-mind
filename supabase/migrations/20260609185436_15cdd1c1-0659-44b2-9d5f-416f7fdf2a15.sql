
-- ============================================================
-- Tables first (policies that cross-reference need both to exist)
-- ============================================================
CREATE TABLE public.exec_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exec_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.exec_messages(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  read_at timestamptz NULL,
  read_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exec_message_recipients_unique UNIQUE (message_id, organization_id)
);
CREATE INDEX exec_message_recipients_org_idx
  ON public.exec_message_recipients (organization_id);

CREATE TABLE public.exec_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.exec_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exec_message_attachments_message_idx
  ON public.exec_message_attachments (message_id);

-- ============================================================
-- Grants
-- ============================================================
GRANT SELECT, INSERT ON public.exec_messages TO authenticated;
GRANT ALL ON public.exec_messages TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.exec_message_recipients TO authenticated;
GRANT ALL ON public.exec_message_recipients TO service_role;

GRANT SELECT, INSERT ON public.exec_message_attachments TO authenticated;
GRANT ALL ON public.exec_message_attachments TO service_role;

-- ============================================================
-- RLS enable
-- ============================================================
ALTER TABLE public.exec_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exec_message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exec_message_attachments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policies: exec_messages
-- ============================================================
CREATE POLICY "exec_messages select"
  ON public.exec_messages FOR SELECT
  USING (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exec_message_recipients r
      WHERE r.message_id = exec_messages.id
        AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
    )
  );

CREATE POLICY "exec_messages insert"
  ON public.exec_messages FOR INSERT
  WITH CHECK (
    (public.is_hive_executive(auth.uid()) OR public.is_super_admin(auth.uid()))
    AND sender_user_id = auth.uid()
  );

-- ============================================================
-- Policies: exec_message_recipients
-- Each row is independently evaluated against the reader's org —
-- a company admin sees ONLY their own org's recipient row, never
-- sibling rows for the same message.
-- ============================================================
CREATE POLICY "exec_message_recipients select"
  ON public.exec_message_recipients FOR SELECT
  USING (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
  );

CREATE POLICY "exec_message_recipients insert"
  ON public.exec_message_recipients FOR INSERT
  WITH CHECK (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "exec_message_recipients update"
  ON public.exec_message_recipients FOR UPDATE
  USING (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
  )
  WITH CHECK (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
  );

-- ============================================================
-- Policies: exec_message_attachments
-- ============================================================
CREATE POLICY "exec_message_attachments select"
  ON public.exec_message_attachments FOR SELECT
  USING (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exec_message_recipients r
      WHERE r.message_id = exec_message_attachments.message_id
        AND public.is_org_admin_or_manager(r.organization_id, auth.uid())
    )
  );

CREATE POLICY "exec_message_attachments insert"
  ON public.exec_message_attachments FOR INSERT
  WITH CHECK (
    public.is_hive_executive(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- ============================================================
-- storage.objects policies for message-attachments bucket
-- Path convention: <organization_id>/<message_id>/<filename>
-- ============================================================
CREATE POLICY "message-attachments download"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-attachments'
    AND (
      public.is_hive_executive(auth.uid())
      OR public.is_super_admin(auth.uid())
      OR public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );

CREATE POLICY "message-attachments upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND (
      public.is_hive_executive(auth.uid())
      OR public.is_super_admin(auth.uid())
    )
  );
