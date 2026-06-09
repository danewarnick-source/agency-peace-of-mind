
-- ============================================================
-- import_subjects: one row per person extracted in a job
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('employee','client')),
  display_name text NOT NULL,
  match_status text NOT NULL DEFAULT 'new' CHECK (match_status IN ('new','matched_existing','ambiguous')),
  matched_record_id uuid,
  review_decision text CHECK (review_decision IN ('update','create_new','skip')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','in_progress','ready','approved')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_subjects_job ON public.import_subjects(import_job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_subjects TO authenticated;
GRANT ALL ON public.import_subjects TO service_role;
ALTER TABLE public.import_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_subjects admin manage" ON public.import_subjects;
CREATE POLICY "import_subjects admin manage" ON public.import_subjects
  TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- assignment_map: proposed staff <-> client links at job level
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignment_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('caseload','team','home','behaviorist')),
  staff_subject_id uuid REFERENCES public.import_subjects(id) ON DELETE SET NULL,
  client_subject_id uuid REFERENCES public.import_subjects(id) ON DELETE SET NULL,
  staff_record_id uuid,
  client_record_id uuid,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','rejected','edited')),
  inference_reason text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_map_job ON public.assignment_map(import_job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_map TO authenticated;
GRANT ALL ON public.assignment_map TO service_role;
ALTER TABLE public.assignment_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assignment_map admin manage" ON public.assignment_map;
CREATE POLICY "assignment_map admin manage" ON public.assignment_map
  TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- import_nectar_questions: clarifications NECTAR asks the admin
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_nectar_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  import_subject_id uuid REFERENCES public.import_subjects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question text NOT NULL,
  context text,
  answer text,
  answered_by uuid,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nectar_questions_job ON public.import_nectar_questions(import_job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_nectar_questions TO authenticated;
GRANT ALL ON public.import_nectar_questions TO service_role;
ALTER TABLE public.import_nectar_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_nectar_questions admin manage" ON public.import_nectar_questions;
CREATE POLICY "import_nectar_questions admin manage" ON public.import_nectar_questions
  TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- import_cert_documents: staged cert/training docs uploaded during review
-- ============================================================
CREATE TABLE IF NOT EXISTS public.import_cert_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  import_subject_id uuid NOT NULL REFERENCES public.import_subjects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cert_key text NOT NULL,
  state text NOT NULL DEFAULT 'unverified' CHECK (state IN ('unverified','verified','provisional')),
  storage_path text,
  file_name text,
  expiry_date date,
  signed_off_by uuid,
  signed_off_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cert_docs_subject ON public.import_cert_documents(import_subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_cert_documents TO authenticated;
GRANT ALL ON public.import_cert_documents TO service_role;
ALTER TABLE public.import_cert_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_cert_documents admin manage" ON public.import_cert_documents;
CREATE POLICY "import_cert_documents admin manage" ON public.import_cert_documents
  TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.app_role) OR public.has_org_role(org_id, auth.uid(), 'super_admin'::public.app_role));

-- ============================================================
-- Extend extracted_fields
-- ============================================================
ALTER TABLE public.extracted_fields
  ADD COLUMN IF NOT EXISTS import_subject_id uuid REFERENCES public.import_subjects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_custom_attribute boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_value text,
  ADD COLUMN IF NOT EXISTS original_target_field text;
CREATE INDEX IF NOT EXISTS idx_extracted_fields_subject ON public.extracted_fields(import_subject_id);

-- ============================================================
-- Extend unfiled_items
-- ============================================================
ALTER TABLE public.unfiled_items
  ADD COLUMN IF NOT EXISTS import_subject_id uuid REFERENCES public.import_subjects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_unfiled_items_subject ON public.unfiled_items(import_subject_id);

-- ============================================================
-- Extend import_jobs
-- ============================================================
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS mode text CHECK (mode IN ('employee','client')),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'self_service',
  ADD COLUMN IF NOT EXISTS scale text DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS target_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid;

-- Expand status check to include extracting and submitted_for_setup
ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_status_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_status_check
  CHECK (status = ANY (ARRAY['draft','extracting','in_review','submitted_for_setup','committed','discarded']));

-- ============================================================
-- Extend import_documents
-- ============================================================
ALTER TABLE public.import_documents
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid;

-- ============================================================
-- Extend import_audit (stays append-only — no update/delete policies)
-- ============================================================
ALTER TABLE public.import_audit
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.import_subjects(id) ON DELETE SET NULL;

-- ============================================================
-- Extend provisioning_rules (broader scope)
-- ============================================================
ALTER TABLE public.provisioning_rules
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'both' CHECK (applies_to IN ('employee','client','both'));

ALTER TABLE public.provisioning_rules DROP CONSTRAINT IF EXISTS provisioning_rules_action_type_check;
ALTER TABLE public.provisioning_rules ADD CONSTRAINT provisioning_rules_action_type_check
  CHECK (action_type = ANY (ARRAY['enable_feature','create_draft','seed_record','activate_requirements']));

ALTER TABLE public.provisioning_rules DROP CONSTRAINT IF EXISTS provisioning_rules_target_module_check;
ALTER TABLE public.provisioning_rules ADD CONSTRAINT provisioning_rules_target_module_check
  CHECK (target_module = ANY (ARRAY['time_clock','daily_logs','med_mgmt','incident_reporting','behavior_plan','compliance_track','requirements','training']));

ALTER TABLE public.provisioning_rules DROP CONSTRAINT IF EXISTS provisioning_rules_trigger_type_check;
ALTER TABLE public.provisioning_rules ADD CONSTRAINT provisioning_rules_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY['service_code','keyword','data_present','role']));

-- ============================================================
-- Extend provisioning_plan
-- ============================================================
ALTER TABLE public.provisioning_plan
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.import_subjects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS attributed_to_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_note text;

ALTER TABLE public.provisioning_plan DROP CONSTRAINT IF EXISTS provisioning_plan_state_check;
ALTER TABLE public.provisioning_plan ADD CONSTRAINT provisioning_plan_state_check
  CHECK (state = ANY (ARRAY['will_create','draft','added_by_admin','na']));
CREATE INDEX IF NOT EXISTS idx_provisioning_plan_subject ON public.provisioning_plan(subject_id);

-- ============================================================
-- updated_at triggers (reuse public.update_updated_at_column if present)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_import_subjects_updated ON public.import_subjects';
    EXECUTE 'CREATE TRIGGER trg_import_subjects_updated BEFORE UPDATE ON public.import_subjects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_assignment_map_updated ON public.assignment_map';
    EXECUTE 'CREATE TRIGGER trg_assignment_map_updated BEFORE UPDATE ON public.assignment_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_cert_docs_updated ON public.import_cert_documents';
    EXECUTE 'CREATE TRIGGER trg_cert_docs_updated BEFORE UPDATE ON public.import_cert_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $$;
