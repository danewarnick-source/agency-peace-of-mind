-- =====================================================================
-- DSPD Compliance Engine (pilot) — Phase 1
--
-- New tenant-agnostic catalog tables + org-scoped instance tables for the
-- versioned, typed-condition-tree compliance rule engine described in
-- docs/DSPD_COMPLIANCE_DESIGN.md. Everything here stays rule_status IN
-- ('draft','pilot') for the duration of this engagement; nothing reaches
-- 'published'. Rule EXECUTION (assignment generation) is additionally
-- gated in application code to organizations.is_demo = true (the existing
-- flag from 20260603022300_c48efc18-c554-4217-b2e2-b79376d68ee5.sql) so
-- the real True North Supports tenant is never touched by this migration
-- or by anything built on top of it.
--
-- Follows the exact convention in
-- supabase/migrations/20260813233000_company_obligations_and_staff_groups.sql
-- (organization_id FK, is_org_member/is_org_admin_or_manager/is_super_admin
-- policies, GRANT to authenticated + service_role, indexes, set_updated_at
-- trigger). is_org_member/is_org_admin_or_manager/is_super_admin/
-- set_updated_at are assumed to already exist live (confirmed via
-- 20260521183750_... and prior migrations) — this file does not redefine
-- them.
-- =====================================================================

-- ── Catalog: requirement definitions (versioned, clause-linked) ─────────────
CREATE TABLE IF NOT EXISTS public.dspd_requirement_definitions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_key       text NOT NULL,
  version               integer NOT NULL DEFAULT 1,
  source_clause_id      text,
  section_ref           text,
  sow_version           text NOT NULL DEFAULT 'DHHS91172',
  effective_date        date,
  title                 text NOT NULL,
  category              text,
  applies_to            text NOT NULL CHECK (applies_to IN ('agency', 'staff', 'client', 'site')),
  service_codes         text[] NOT NULL DEFAULT '{}', -- empty = ALL
  applicability_rule    jsonb,                         -- typed condition tree; null = always applicable
  completion_group      jsonb,                         -- ALL/ANY element tree; null = single atomic completion
  deadline_anchor       text,                          -- e.g. hire_date, first_solo_service_at, staff_client_assignment
  deadline_offset_days  integer,
  deadline_rule_note    text,                          -- free text for compound/branching deadlines (e.g. 30.6.a cohort split)
  reminder_offset_days  integer[] NOT NULL DEFAULT '{}', -- kept separate from deadline_offset_days on purpose
  renewal_rule          text,                          -- null = explicitly non-recurring, never defaulted to "annual"
  handling_label        text CHECK (handling_label IN ('IN_PLATFORM', 'UPLOAD', 'EXTERNAL', 'SYSTEM')),
  acceptance_criteria   jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_facts_needed    text[] NOT NULL DEFAULT '{}',
  rule_status           text NOT NULL DEFAULT 'draft' CHECK (rule_status IN ('draft', 'pilot', 'published', 'superseded')),
  approved_by           uuid,
  approved_at           timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_key, version)
);

CREATE INDEX IF NOT EXISTS idx_dspd_reqdef_key ON public.dspd_requirement_definitions(requirement_key);
CREATE INDEX IF NOT EXISTS idx_dspd_reqdef_status ON public.dspd_requirement_definitions(rule_status);

GRANT SELECT ON public.dspd_requirement_definitions TO authenticated;
GRANT ALL ON public.dspd_requirement_definitions TO service_role;

ALTER TABLE public.dspd_requirement_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read requirement definitions"
  ON public.dspd_requirement_definitions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service role manages requirement definitions"
  ON public.dspd_requirement_definitions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS dspd_requirement_definitions_set_updated_at ON public.dspd_requirement_definitions;
CREATE TRIGGER dspd_requirement_definitions_set_updated_at
  BEFORE UPDATE ON public.dspd_requirement_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Catalog: sub-elements (independently queryable for ALL/ANY progress) ───
CREATE TABLE IF NOT EXISTS public.dspd_requirement_elements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_definition_id  uuid NOT NULL REFERENCES public.dspd_requirement_definitions(id) ON DELETE CASCADE,
  clause_id                  text,
  element_key                text NOT NULL,
  clause_text                text NOT NULL,
  requirement_role           text NOT NULL DEFAULT 'element',
  route_group                text,        -- for ANY-groups: which route this element belongs to
  sort_order                 integer NOT NULL DEFAULT 0,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_definition_id, element_key)
);

CREATE INDEX IF NOT EXISTS idx_dspd_reqelem_reqdef ON public.dspd_requirement_elements(requirement_definition_id);

GRANT SELECT ON public.dspd_requirement_elements TO authenticated;
GRANT ALL ON public.dspd_requirement_elements TO service_role;

ALTER TABLE public.dspd_requirement_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read requirement elements"
  ON public.dspd_requirement_elements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service role manages requirement elements"
  ON public.dspd_requirement_elements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Catalog: fact definitions (seeded from Applicability_Facts.csv) ─────────
CREATE TABLE IF NOT EXISTS public.dspd_fact_definitions (
  fact_id                  text PRIMARY KEY,
  fact_scope               text NOT NULL CHECK (fact_scope IN ('agency', 'staff', 'client', 'site')),
  question                 text NOT NULL,
  answer_type              text NOT NULL,
  answered_by              text,
  linked_requirement_keys  text[] NOT NULL DEFAULT '{}',
  collection_rule          text,
  wired_for_pilot          boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dspd_fact_definitions TO authenticated;
GRANT ALL ON public.dspd_fact_definitions TO service_role;

ALTER TABLE public.dspd_fact_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read fact definitions"
  ON public.dspd_fact_definitions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service role manages fact definitions"
  ON public.dspd_fact_definitions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Org data: effective-dated fact answers ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dspd_agency_facts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fact_id           text NOT NULL REFERENCES public.dspd_fact_definitions(fact_id) ON DELETE CASCADE,
  subject_type      text NOT NULL CHECK (subject_type IN ('agency', 'staff', 'client', 'site')),
  subject_id        uuid, -- null for agency-level facts
  value             jsonb NOT NULL,
  effective_from    timestamptz NOT NULL DEFAULT now(),
  effective_to      timestamptz, -- null = current
  recorded_by       uuid,
  source            text NOT NULL DEFAULT 'setup_wizard' CHECK (source IN ('setup_wizard', 'admin_edit', 'derived')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dspd_agency_facts_org_fact_current
  ON public.dspd_agency_facts(organization_id, fact_id, subject_id)
  WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_dspd_agency_facts_subject
  ON public.dspd_agency_facts(subject_type, subject_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dspd_agency_facts TO authenticated;
GRANT ALL ON public.dspd_agency_facts TO service_role;

ALTER TABLE public.dspd_agency_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read agency facts"
  ON public.dspd_agency_facts FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage agency facts"
  ON public.dspd_agency_facts FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- ── Org data: setup-wizard gate state ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dspd_setup_progress (
  organization_id     uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  required_fact_ids   text[] NOT NULL DEFAULT '{}',
  answered_fact_ids   text[] NOT NULL DEFAULT '{}',
  is_complete         boolean NOT NULL DEFAULT false,
  completed_at        timestamptz,
  backfilled          boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.dspd_setup_progress TO authenticated;
GRANT ALL ON public.dspd_setup_progress TO service_role;

ALTER TABLE public.dspd_setup_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read setup progress"
  ON public.dspd_setup_progress FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage setup progress"
  ON public.dspd_setup_progress FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS dspd_setup_progress_set_updated_at ON public.dspd_setup_progress;
CREATE TRIGGER dspd_setup_progress_set_updated_at
  BEFORE UPDATE ON public.dspd_setup_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Org data: per-subject requirement instances (lifecycle, not boolean) ───
CREATE TABLE IF NOT EXISTS public.dspd_assignments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_definition_id   uuid NOT NULL REFERENCES public.dspd_requirement_definitions(id) ON DELETE CASCADE,
  subject_type                text NOT NULL CHECK (subject_type IN ('agency', 'staff', 'client')),
  subject_id                  uuid, -- null for agency-level
  period_or_event_key         text NOT NULL, -- dedupe key, e.g. 'hire', '2027', 'client:<id>'
  status                      text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'submitted', 'needs_correction', 'accepted', 'expired', 'superseded', 'not_applicable')),
  due_at                      timestamptz,
  generated_from_fact_id      text REFERENCES public.dspd_fact_definitions(fact_id) ON DELETE SET NULL,
  generated_reason            text,
  unit_progress                jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by                 uuid,
  reviewed_at                 timestamptz,
  review_notes                text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_definition_id, subject_type, subject_id, period_or_event_key)
);

CREATE INDEX IF NOT EXISTS idx_dspd_assignments_org_status_due
  ON public.dspd_assignments(organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_dspd_assignments_subject
  ON public.dspd_assignments(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_dspd_assignments_reqdef
  ON public.dspd_assignments(requirement_definition_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dspd_assignments TO authenticated;
GRANT ALL ON public.dspd_assignments TO service_role;

ALTER TABLE public.dspd_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read assignments"
  ON public.dspd_assignments FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage assignments"
  ON public.dspd_assignments FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS dspd_assignments_set_updated_at ON public.dspd_assignments;
CREATE TRIGGER dspd_assignments_set_updated_at
  BEFORE UPDATE ON public.dspd_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Org data: reusable evidence records ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dspd_evidence (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_type        text NOT NULL CHECK (subject_type IN ('agency', 'staff', 'client')),
  subject_id          uuid,
  evidence_kind       text NOT NULL CHECK (evidence_kind IN ('credential', 'training_record', 'attestation', 'external_receipt')),
  qualification_key   text, -- normalized kind:key, aligned with staff-qualifications.functions.ts
  issuer              text,
  scope               text,
  valid_from          date,
  valid_to            date, -- null = does not expire
  file_path           text,
  external_reference  text,
  attestation_id      uuid REFERENCES public.policy_signatures(id) ON DELETE SET NULL,
  review_status       text NOT NULL DEFAULT 'submitted' CHECK (review_status IN ('submitted', 'accepted', 'rejected')),
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  review_notes        text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dspd_evidence_org_subject
  ON public.dspd_evidence(organization_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_dspd_evidence_status
  ON public.dspd_evidence(review_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dspd_evidence TO authenticated;
GRANT ALL ON public.dspd_evidence TO service_role;

ALTER TABLE public.dspd_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read evidence"
  ON public.dspd_evidence FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "org members submit evidence"
  ON public.dspd_evidence FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage evidence"
  ON public.dspd_evidence FOR UPDATE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins delete evidence"
  ON public.dspd_evidence FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS dspd_evidence_set_updated_at ON public.dspd_evidence;
CREATE TRIGGER dspd_evidence_set_updated_at
  BEFORE UPDATE ON public.dspd_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Org data: evidence <-> assignment/element many-to-many (reuse) ──────────
CREATE TABLE IF NOT EXISTS public.dspd_evidence_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id    uuid NOT NULL REFERENCES public.dspd_evidence(id) ON DELETE CASCADE,
  assignment_id  uuid NOT NULL REFERENCES public.dspd_assignments(id) ON DELETE CASCADE,
  element_id     uuid REFERENCES public.dspd_requirement_elements(id) ON DELETE CASCADE, -- null = satisfies whole requirement
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id, assignment_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_dspd_evidence_links_evidence ON public.dspd_evidence_links(evidence_id);
CREATE INDEX IF NOT EXISTS idx_dspd_evidence_links_assignment ON public.dspd_evidence_links(assignment_id);

GRANT SELECT, INSERT, DELETE ON public.dspd_evidence_links TO authenticated;
GRANT ALL ON public.dspd_evidence_links TO service_role;

ALTER TABLE public.dspd_evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read evidence links"
  ON public.dspd_evidence_links FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dspd_assignments a
      WHERE a.id = dspd_evidence_links.assignment_id
        AND is_org_member(a.organization_id, auth.uid())
    )
  );

CREATE POLICY "admins manage evidence links"
  ON public.dspd_evidence_links FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dspd_assignments a
      WHERE a.id = dspd_evidence_links.assignment_id
        AND is_org_admin_or_manager(a.organization_id, auth.uid())
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dspd_assignments a
      WHERE a.id = dspd_evidence_links.assignment_id
        AND is_org_admin_or_manager(a.organization_id, auth.uid())
    )
  );

-- ── Backfill: existing organizations are never gated by the setup wizard ───
-- Every org that already has staff or clients (in particular True North
-- Supports) is marked setup-complete now, so the Phase 4 beforeLoad gate
-- never blocks or disrupts current tenant data/access. New orgs created
-- after this migration get no dspd_setup_progress row and are gated until
-- the wizard runs.
INSERT INTO public.dspd_setup_progress (organization_id, required_fact_ids, answered_fact_ids, is_complete, completed_at, backfilled)
SELECT o.id, '{}', '{}', true, now(), true
FROM public.organizations o
WHERE EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = o.id)
   OR EXISTS (SELECT 1 FROM public.clients c WHERE c.organization_id = o.id)
ON CONFLICT (organization_id) DO NOTHING;
