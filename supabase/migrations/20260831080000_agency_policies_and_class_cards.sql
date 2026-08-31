-- Training remaining: agency policy binder + CPR/Mandt class cards.
-- Idempotent. Do NOT drop or truncate. Do NOT run against production from CI —
-- Dane reviews this in the PR, then pastes it into Lovable's SQL editor
-- (clear the editor first). See docs/SQL_HANDOFF.md.

-- ── company_obligations.agency_policy_id ──────────────────────────────────
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS agency_policy_id uuid;

-- ── Table: agency_policies (one binder per agency) ────────────────────────
CREATE TABLE IF NOT EXISTS public.agency_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  audience_kind text NOT NULL DEFAULT 'everyone'
    CHECK (audience_kind IN ('everyone', 'drivers', 'job_code')),
  audience_job_code text,
  body_text text,
  file_path text,
  file_name text,
  file_mime text,
  file_size_bytes bigint,
  obligation_id uuid REFERENCES public.company_obligations(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_policies_has_content CHECK (
    (body_text IS NOT NULL AND length(btrim(body_text)) > 0)
    OR (file_path IS NOT NULL AND length(btrim(file_path)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_policies_org_title_active_idx
  ON public.agency_policies (organization_id, lower(title))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS agency_policies_org_idx
  ON public.agency_policies (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agency_policies_obligation_idx
  ON public.agency_policies (obligation_id)
  WHERE obligation_id IS NOT NULL;

ALTER TABLE public.agency_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_policies_select_org_member" ON public.agency_policies;
CREATE POLICY "agency_policies_select_org_member"
  ON public.agency_policies FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "agency_policies_insert_admin" ON public.agency_policies;
CREATE POLICY "agency_policies_insert_admin"
  ON public.agency_policies FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS "agency_policies_update_admin" ON public.agency_policies;
CREATE POLICY "agency_policies_update_admin"
  ON public.agency_policies FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.agency_policies TO authenticated;
GRANT ALL ON public.agency_policies TO service_role;

-- Back-link from the obligation row (no FK cycle; policies already point at obligations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_obligations_agency_policy_id_fkey'
  ) THEN
    ALTER TABLE public.company_obligations
      ADD CONSTRAINT company_obligations_agency_policy_id_fkey
      FOREIGN KEY (agency_policy_id) REFERENCES public.agency_policies(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Class completion cards ────────────────────────────────────────────────
ALTER TABLE public.training_class_roster
  ADD COLUMN IF NOT EXISTS card_path text,
  ADD COLUMN IF NOT EXISTS card_filename text,
  ADD COLUMN IF NOT EXISTS card_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS obligation_instance_id uuid;

ALTER TABLE public.training_classes
  ADD COLUMN IF NOT EXISTS class_card_path text,
  ADD COLUMN IF NOT EXISTS class_card_filename text,
  ADD COLUMN IF NOT EXISTS class_card_uploaded_at timestamptz;

-- ── Storage: agency-policies (100 MB, PDF / slides / video / images) ──────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agency-policies',
  'agency-policies',
  false,
  104857600,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "agency_policies_storage_select" ON storage.objects;
CREATE POLICY "agency_policies_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'agency-policies'
    AND (
      public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
      OR public.is_hive_executive(auth.uid())
    )
  );

DROP POLICY IF EXISTS "agency_policies_storage_insert" ON storage.objects;
CREATE POLICY "agency_policies_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agency-policies'
    AND (
      public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR public.is_hive_executive(auth.uid())
    )
  );

DROP POLICY IF EXISTS "agency_policies_storage_update" ON storage.objects;
CREATE POLICY "agency_policies_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'agency-policies'
    AND (
      public.is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid())
      OR public.is_hive_executive(auth.uid())
    )
  );
