
-- Behavior Support module — Section 1: schema + seed
-- Org-scoped + client-scoped. Reuses existing helpers: is_org_member, has_org_role, clients_for_staff.

-- Enums
DO $$ BEGIN CREATE TYPE public.bc_code AS ENUM ('BC1','BC2','BC3'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bc_doc_type AS ENUM ('FBA','BSP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bc_behavior_status AS ENUM ('draft','approved','published','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bc_behavior_source AS ENUM ('nectar','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bc_review_note_type AS ENUM ('monthly_review','note'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bc_flag_type AS ENUM ('credential_mismatch','deadline_overdue','coverage_gap'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add bc_role to profiles (nullable; null = not a behaviorist)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bc_role public.bc_code NULL;

-- =========================================================================
-- behavior_support_clients (per-client config)
-- =========================================================================
CREATE TABLE public.behavior_support_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  bc_code public.bc_code NOT NULL,
  features_enabled boolean NOT NULL DEFAULT false,
  assigned_behaviorist_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavior_support_clients TO authenticated;
GRANT ALL ON public.behavior_support_clients TO service_role;
ALTER TABLE public.behavior_support_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bsc_admin_full" ON public.behavior_support_clients FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));

CREATE POLICY "bsc_behaviorist_assigned_read" ON public.behavior_support_clients FOR SELECT TO authenticated
USING (assigned_behaviorist_user_id = auth.uid());

CREATE POLICY "bsc_staff_caseload_read" ON public.behavior_support_clients FOR SELECT TO authenticated
USING (
  features_enabled = true
  AND EXISTS (
    SELECT 1 FROM public.clients_for_staff(organization_id, auth.uid()) c
    WHERE c.id = client_id
  )
);

CREATE TRIGGER trg_bsc_updated BEFORE UPDATE ON public.behavior_support_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- bc_documents (FBA / BSP vault)
-- =========================================================================
CREATE TABLE public.bc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  doc_type public.bc_doc_type NOT NULL,
  storage_path text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  uploaded_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bc_documents_client_idx ON public.bc_documents(client_id, doc_type, is_current);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bc_documents TO authenticated;
GRANT ALL ON public.bc_documents TO service_role;
ALTER TABLE public.bc_documents ENABLE ROW LEVEL SECURITY;

-- Admin + assigned behaviorist write
CREATE POLICY "bc_docs_admin_write" ON public.bc_documents FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                 WHERE bsc.client_id = bc_documents.client_id
                   AND bsc.assigned_behaviorist_user_id = auth.uid()))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                 WHERE bsc.client_id = bc_documents.client_id
                   AND bsc.assigned_behaviorist_user_id = auth.uid()));

-- All roles read if they can see the client AND module is enabled for that client
CREATE POLICY "bc_docs_read_visible" ON public.bc_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.behavior_support_clients bsc
    WHERE bsc.client_id = bc_documents.client_id
      AND bsc.features_enabled = true
  )
  AND (
    public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients_for_staff(organization_id, auth.uid()) c
                 WHERE c.id = bc_documents.client_id)
  )
);

CREATE TRIGGER trg_bc_docs_updated BEFORE UPDATE ON public.bc_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- bc_behaviors (target behaviors)
-- =========================================================================
CREATE TABLE public.bc_behaviors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  operational_definition text NOT NULL DEFAULT '',
  data_method text NOT NULL DEFAULT '',
  bsp_citation text NOT NULL DEFAULT '',
  status public.bc_behavior_status NOT NULL DEFAULT 'draft',
  expected_cadence text NOT NULL DEFAULT 'Every shift',
  source public.bc_behavior_source NOT NULL DEFAULT 'manual',
  drafted_by_user_id uuid NULL REFERENCES auth.users(id),
  approved_by_user_id uuid NULL REFERENCES auth.users(id),
  approved_at timestamptz NULL,
  published_by_user_id uuid NULL REFERENCES auth.users(id),
  published_at timestamptz NULL,
  last_logged_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bc_behaviors_client_idx ON public.bc_behaviors(client_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bc_behaviors TO authenticated;
GRANT ALL ON public.bc_behaviors TO service_role;
ALTER TABLE public.bc_behaviors ENABLE ROW LEVEL SECURITY;

-- Admin: full
CREATE POLICY "bc_behaviors_admin_full" ON public.bc_behaviors FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));

-- Behaviorist: full on their assigned clients
CREATE POLICY "bc_behaviors_behaviorist_full" ON public.bc_behaviors FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_behaviors.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_behaviors.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()));

-- Staff: read published only, for clients on their caseload, when module enabled
CREATE POLICY "bc_behaviors_staff_read_published" ON public.bc_behaviors FOR SELECT TO authenticated
USING (
  status = 'published'
  AND EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
              WHERE bsc.client_id = bc_behaviors.client_id
                AND bsc.features_enabled = true)
  AND EXISTS (SELECT 1 FROM public.clients_for_staff(organization_id, auth.uid()) c
              WHERE c.id = bc_behaviors.client_id)
);

CREATE TRIGGER trg_bc_behaviors_updated BEFORE UPDATE ON public.bc_behaviors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- bc_data_entries (DSP data collection)
-- =========================================================================
CREATE TABLE public.bc_data_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  behavior_id uuid NOT NULL REFERENCES public.bc_behaviors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  count int NULL,
  intensity int NULL CHECK (intensity IS NULL OR (intensity BETWEEN 1 AND 5)),
  duration_seconds int NULL,
  abc_antecedent text NOT NULL DEFAULT '',
  abc_behavior text NOT NULL DEFAULT '',
  abc_consequence text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bc_data_entries_behavior_time_idx ON public.bc_data_entries(behavior_id, occurred_at DESC);
CREATE INDEX bc_data_entries_client_idx ON public.bc_data_entries(client_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bc_data_entries TO authenticated;
GRANT ALL ON public.bc_data_entries TO service_role;
ALTER TABLE public.bc_data_entries ENABLE ROW LEVEL SECURITY;

-- Admin: full
CREATE POLICY "bc_data_admin_full" ON public.bc_data_entries FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));

-- Behaviorist: full on assigned client's data
CREATE POLICY "bc_data_behaviorist_full" ON public.bc_data_entries FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_data_entries.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_data_entries.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()));

-- Staff: INSERT own only, behavior must be published + on caseload
CREATE POLICY "bc_data_staff_insert_own" ON public.bc_data_entries FOR INSERT TO authenticated
WITH CHECK (
  staff_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.bc_behaviors b
              WHERE b.id = bc_data_entries.behavior_id
                AND b.status = 'published'
                AND b.client_id = bc_data_entries.client_id)
  AND EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
              WHERE bsc.client_id = bc_data_entries.client_id
                AND bsc.features_enabled = true)
  AND EXISTS (SELECT 1 FROM public.clients_for_staff(organization_id, auth.uid()) c
              WHERE c.id = bc_data_entries.client_id)
);

-- Staff: read only own entries
CREATE POLICY "bc_data_staff_read_own" ON public.bc_data_entries FOR SELECT TO authenticated
USING (staff_user_id = auth.uid());

CREATE TRIGGER trg_bc_data_updated BEFORE UPDATE ON public.bc_data_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- bc_review_notes
-- =========================================================================
CREATE TABLE public.bc_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  note_type public.bc_review_note_type NOT NULL DEFAULT 'note',
  body text NOT NULL DEFAULT '',
  period_start date NULL,
  period_end date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bc_review_notes_client_idx ON public.bc_review_notes(client_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bc_review_notes TO authenticated;
GRANT ALL ON public.bc_review_notes TO service_role;
ALTER TABLE public.bc_review_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc_notes_admin_full" ON public.bc_review_notes FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));

CREATE POLICY "bc_notes_behaviorist_full" ON public.bc_review_notes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_review_notes.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_review_notes.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()));

CREATE TRIGGER trg_bc_notes_updated BEFORE UPDATE ON public.bc_review_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- bc_flags
-- =========================================================================
CREATE TABLE public.bc_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  flag_type public.bc_flag_type NOT NULL,
  detail text NOT NULL DEFAULT '',
  acknowledged_by_user_id uuid NULL REFERENCES auth.users(id),
  acknowledged_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bc_flags_client_idx ON public.bc_flags(client_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bc_flags TO authenticated;
GRANT ALL ON public.bc_flags TO service_role;
ALTER TABLE public.bc_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc_flags_admin_full" ON public.bc_flags FOR ALL TO authenticated
USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
    OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role));

CREATE POLICY "bc_flags_behaviorist_read" ON public.bc_flags FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.behavior_support_clients bsc
                WHERE bsc.client_id = bc_flags.client_id
                  AND bsc.assigned_behaviorist_user_id = auth.uid()));

CREATE TRIGGER trg_bc_flags_updated BEFORE UPDATE ON public.bc_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- SEED: enable on demo client Brandon Johnson (org 7fabcf5d...),
-- assign Tom Jones as a BC3 behaviorist with bc_role='BC3'.
-- =========================================================================
UPDATE public.profiles SET bc_role = 'BC3' WHERE id = '1a45bc15-cf57-49f9-a8db-776b29b1eb25';

INSERT INTO public.behavior_support_clients
  (organization_id, client_id, bc_code, features_enabled, assigned_behaviorist_user_id)
VALUES
  ('7fabcf5d-f826-487f-8730-8b0c3f1969bb',
   '1b7c7f79-2351-4f4b-81d0-e0c58c90a266',
   'BC3', true,
   '1a45bc15-cf57-49f9-a8db-776b29b1eb25')
ON CONFLICT (client_id) DO UPDATE
  SET features_enabled = EXCLUDED.features_enabled,
      bc_code = EXCLUDED.bc_code,
      assigned_behaviorist_user_id = EXCLUDED.assigned_behaviorist_user_id;

-- Two sample target behaviors (one published, one draft) for Brandon
INSERT INTO public.bc_behaviors
  (organization_id, client_id, name, operational_definition, data_method, bsp_citation,
   status, expected_cadence, source, drafted_by_user_id, approved_by_user_id, approved_at,
   published_by_user_id, published_at)
VALUES
  ('7fabcf5d-f826-487f-8730-8b0c3f1969bb',
   '1b7c7f79-2351-4f4b-81d0-e0c58c90a266',
   'Elopement',
   'Leaving designated area without staff knowledge for >10 seconds.',
   'Frequency count + ABC narrative',
   'BSP §3.1 Target Behaviors',
   'published', 'Every shift', 'manual',
   '1a45bc15-cf57-49f9-a8db-776b29b1eb25',
   '1a45bc15-cf57-49f9-a8db-776b29b1eb25', now(),
   '1a45bc15-cf57-49f9-a8db-776b29b1eb25', now()),
  ('7fabcf5d-f826-487f-8730-8b0c3f1969bb',
   '1b7c7f79-2351-4f4b-81d0-e0c58c90a266',
   'Property disruption',
   'Throwing, hitting, or breaking household items.',
   'Frequency + intensity (1-5)',
   'BSP §3.2 Target Behaviors',
   'draft', 'Daily', 'manual',
   '1a45bc15-cf57-49f9-a8db-776b29b1eb25',
   NULL, NULL, NULL, NULL);
