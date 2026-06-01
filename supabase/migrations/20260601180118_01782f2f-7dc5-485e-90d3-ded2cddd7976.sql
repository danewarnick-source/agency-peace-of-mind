
-- Universal document store powering NECTAR
CREATE TABLE public.nectar_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  -- Owning entity
  owner_kind text NOT NULL CHECK (owner_kind IN ('client','staff','company','state','other')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  staff_id uuid,
  -- Categorization
  document_type text NOT NULL, -- pcsp, 1056_budget, sow, referral, intake, assessment, certification, training, contract, evv, other
  category text, -- broader bucket: client_form|staff_doc|admin_doc|state|contract
  title text NOT NULL,
  -- Versioning
  parent_document_id uuid REFERENCES public.nectar_documents(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  -- Period / dates
  effective_start date,
  effective_end date,
  fiscal_year text,
  -- IDs payload
  medicaid_id text,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Storage
  storage_bucket text NOT NULL DEFAULT 'nectar-documents',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  source text, -- upload|migration|api|email
  -- Parse state
  parse_status text NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending','parsing','parsed','failed','skipped')),
  parse_error text,
  parsed_at timestamptz,
  raw_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Audit
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nectar_docs_org ON public.nectar_documents(organization_id);
CREATE INDEX idx_nectar_docs_client ON public.nectar_documents(client_id);
CREATE INDEX idx_nectar_docs_staff ON public.nectar_documents(staff_id);
CREATE INDEX idx_nectar_docs_type ON public.nectar_documents(document_type);
CREATE INDEX idx_nectar_docs_current ON public.nectar_documents(organization_id, document_type, is_current) WHERE is_current;
CREATE INDEX idx_nectar_docs_fy ON public.nectar_documents(fiscal_year);
CREATE INDEX idx_nectar_docs_tags ON public.nectar_documents USING GIN(tags);
CREATE INDEX idx_nectar_docs_external ON public.nectar_documents USING GIN(external_ids);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_documents TO authenticated;
GRANT ALL ON public.nectar_documents TO service_role;

ALTER TABLE public.nectar_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read nectar docs" ON public.nectar_documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "admins manage nectar docs" ON public.nectar_documents
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_nectar_docs_updated BEFORE UPDATE ON public.nectar_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extracted structured fields with source traceability
CREATE TABLE public.nectar_extracted_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.nectar_documents(id) ON DELETE CASCADE,
  field_key text NOT NULL,       -- e.g. service_code, rate, max_units, start_date
  field_group text,              -- e.g. billing_code, sow_clause
  value_text text,
  value_number numeric,
  value_date date,
  value_json jsonb,
  source_locator text,           -- e.g. "page 3, §4.2" or "row 12"
  confidence numeric,            -- 0..1
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','overridden','rejected')),
  override_value jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nectar_ef_doc ON public.nectar_extracted_fields(document_id);
CREATE INDEX idx_nectar_ef_org_key ON public.nectar_extracted_fields(organization_id, field_key);
CREATE INDEX idx_nectar_ef_group ON public.nectar_extracted_fields(field_group);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_extracted_fields TO authenticated;
GRANT ALL ON public.nectar_extracted_fields TO service_role;

ALTER TABLE public.nectar_extracted_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read extracted fields" ON public.nectar_extracted_fields
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "admins manage extracted fields" ON public.nectar_extracted_fields
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_nectar_ef_updated BEFORE UPDATE ON public.nectar_extracted_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auxiliary: link a document to multiple entities (e.g. an SOW applies org-wide)
CREATE TABLE public.nectar_document_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.nectar_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  entity_kind text NOT NULL CHECK (entity_kind IN ('client','staff','company','state','program')),
  entity_id uuid,
  entity_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, entity_kind, entity_id)
);

CREATE INDEX idx_nectar_de_doc ON public.nectar_document_entities(document_id);
CREATE INDEX idx_nectar_de_entity ON public.nectar_document_entities(entity_kind, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_document_entities TO authenticated;
GRANT ALL ON public.nectar_document_entities TO service_role;

ALTER TABLE public.nectar_document_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read doc entities" ON public.nectar_document_entities
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "admins manage doc entities" ON public.nectar_document_entities
  FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Storage bucket for the universal store
INSERT INTO storage.buckets (id, name, public)
VALUES ('nectar-documents', 'nectar-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "nectar docs read for org members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'nectar-documents'
    AND EXISTS (
      SELECT 1 FROM public.nectar_documents d
      WHERE d.storage_path = storage.objects.name
        AND (public.is_org_member(d.organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
    )
  );

CREATE POLICY "nectar docs write for admins"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'nectar-documents'
    AND (storage.foldername(name))[1] IS NOT NULL
  );

CREATE POLICY "nectar docs update for admins"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'nectar-documents');

CREATE POLICY "nectar docs delete for admins"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'nectar-documents');
