-- Agency setup questionnaire (comprehensive) — replaces the fixed six-fact
-- completion rule with a registry-driven one. TypeScript twin:
-- src/lib/agency-setup-completion.ts (must match this file's
-- org_setup_is_complete exactly — same required-fact list, same
-- SEI-award-date conditional).
--
-- Do not Soft-apply / execute against Hive-Platform production from this PR.
-- Core pastes this one change at a time after Dane go, clearing the editor
-- first (docs/SQL_HANDOFF.md). Catalog publishing stays untouched — this
-- migration does not publish or activate any DHHS91172 catalog rule.
--
-- Idempotent. No DROP TABLE / DROP COLUMN. Additive only. Existing
-- setup_create_gate_exempt grandfather behavior (20260914120000) is
-- unchanged — this migration only widens which facts org_setup_is_complete
-- reads, it does not touch the exempt snapshot or its lock.
--
-- Some organizations columns below (services_offered, approx_client_count)
-- are already live but were never created by a migration ("ghost" columns —
-- see docs/SQL_HANDOFF.md). ADD COLUMN IF NOT EXISTS guards make this
-- migration a safe no-op for those on an environment where they already
-- exist, while giving them a real migration record going forward.

-- ---------------------------------------------------------------------------
-- 1. New agency-level fact columns (all nullable — null is unanswered, same
--    convention as the existing fact_operates_ol_site / fact_uses_volunteers
--    / fact_has_governing_board columns from 20260911120000).
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS services_offered text[];
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS approx_client_count integer;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_provides_respite_overnight boolean;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_is_usor_vendor boolean;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_supports_self_administered_medication boolean;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_acts_as_representative_payee boolean;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_provides_transportation boolean;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sei_award_date date;
-- Added for the FACT-063 scope fix: REQ-7.5.b/REQ-8.5.b's own applies_to is
-- "agency" (a single program-wide total, not per-location like its sibling
-- REQ-7.5.a/REQ-8.5.a) — was incorrectly a DEFERRED_FACTS "location" entry.
-- Not read by org_setup_is_complete() below (not baseRequired) — see
-- q_community_program_total_persons_served's sourceNote for why.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fact_community_program_total_persons_served integer;

-- ---------------------------------------------------------------------------
-- 2. Versioning — lets a future questionnaire change request only the NEW
--    missing facts from an already-completed org, without erasing anything
--    already answered. setup_completed_at/_by/_version are set exclusively
--    by persistAgencySetupFactsInternal (service role), never by the owner
--    editing their own row directly — locked below the same way
--    setup_create_gate_exempt is already locked.
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS setup_questionnaire_version integer;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS setup_completed_by uuid;

-- ---------------------------------------------------------------------------
-- 3. Canonical completion (must match AGENCY_SETUP_COMPLETION_SPEC in
--    src/lib/agency-setup-completion.ts):
--    services_offered has >=1 trimmed nonempty code; the eight org fact_*
--    booleans are all IS NOT NULL; approx_client_count IS NOT NULL;
--    service_area is a nonblank string; dhhs_provider_id is nonblank;
--    sei_award_date IS NOT NULL only when 'SEI' is an awarded code.
--    Never reads specializations. Never reads compliance_fact_answers —
--    that table is for staff/client/location facts and never gates agency
--    setup (those records cannot exist yet at agency-setup time).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_setup_is_complete(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      COALESCE(cardinality(ARRAY(
        SELECT trim(c)
        FROM unnest(COALESCE(o.services_offered, ARRAY[]::text[])) AS c
        WHERE length(trim(c)) > 0
      )), 0) > 0
      AND o.fact_operates_ol_site IS NOT NULL
      AND o.fact_uses_volunteers IS NOT NULL
      AND o.fact_has_governing_board IS NOT NULL
      AND o.fact_provides_respite_overnight IS NOT NULL
      AND o.fact_is_usor_vendor IS NOT NULL
      AND o.fact_supports_self_administered_medication IS NOT NULL
      AND o.fact_acts_as_representative_payee IS NOT NULL
      AND o.fact_provides_transportation IS NOT NULL
      AND o.approx_client_count IS NOT NULL
      AND o.service_area IS NOT NULL
      AND length(trim(o.service_area)) > 0
      AND o.dhhs_provider_id IS NOT NULL
      AND length(trim(o.dhhs_provider_id)) > 0
      AND (
        NOT ('SEI' = ANY (COALESCE(o.services_offered, ARRAY[]::text[])))
        OR o.sei_award_date IS NOT NULL
      )
    FROM public.organizations o
    WHERE o.id = p_org_id
  ), false);
$$;

-- org_setup_allows_create is unchanged in shape (still complete OR exempt)
-- but is re-created here so it always binds to the org_setup_is_complete
-- body above.
CREATE OR REPLACE FUNCTION public.org_setup_allows_create(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      public.org_setup_is_complete(p_org_id)
      OR COALESCE(o.setup_create_gate_exempt, false)
    FROM public.organizations o
    WHERE o.id = p_org_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.org_setup_is_complete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_setup_is_complete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_setup_is_complete(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.org_setup_allows_create(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_setup_allows_create(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_setup_allows_create(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Lock the new completion-audit columns the same way
--    setup_create_gate_exempt is locked (20260914120000). An authenticated
--    org admin has table-level UPDATE on organizations; column REVOKE is
--    defense-in-depth, the trigger below is authoritative.
-- ---------------------------------------------------------------------------
REVOKE UPDATE (setup_completed_at, setup_completed_by, setup_questionnaire_version)
  ON public.organizations FROM authenticated;
GRANT SELECT (setup_completed_at, setup_completed_by, setup_questionnaire_version)
  ON public.organizations TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_agency_setup_completion_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.setup_completed_at IS NOT DISTINCT FROM OLD.setup_completed_at
     AND NEW.setup_completed_by IS NOT DISTINCT FROM OLD.setup_completed_by
     AND NEW.setup_questionnaire_version IS NOT DISTINCT FROM OLD.setup_questionnaire_version THEN
    RETURN NEW;
  END IF;
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'setup_completed_at / setup_completed_by / setup_questionnaire_version are locked. Only service_role, postgres, or supabase_admin may change them.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_agency_setup_completion_columns ON public.organizations;
CREATE TRIGGER trg_protect_agency_setup_completion_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_agency_setup_completion_columns();

REVOKE ALL ON FUNCTION public.protect_agency_setup_completion_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_agency_setup_completion_columns() TO PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Generic fact-answer storage for staff / client / location / assignment
--    scoped facts (docs/compliance/dhhs91172/Applicability_Facts.json rows
--    whose record cannot exist yet at agency-setup time — see
--    src/lib/obligations/deferred-setup-facts.ts). Never read by
--    org_setup_is_complete / org_setup_allows_create above — this table
--    never gates staff, client, or invitation creation.
--
--    Status is stored separately from value on purpose: "no" and "0" are
--    answers; unanswered / unknown / not_applicable stay distinguishable
--    (task requirement). entity_id is null only for a future agency-scope
--    row; today every row here is location/staff/client/assignment-scoped
--    and entity_id is required by the CHECK below.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_fact_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('location', 'staff', 'client', 'assignment')),
  entity_id uuid NOT NULL,
  fact_key text NOT NULL,
  status text NOT NULL DEFAULT 'unanswered' CHECK (status IN ('unanswered', 'answered', 'unknown', 'not_applicable')),
  value jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'derived', 'imported')),
  questionnaire_version integer NOT NULL DEFAULT 1,
  answered_by uuid,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, scope, entity_id, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_compliance_fact_answers_org
  ON public.compliance_fact_answers (organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_fact_answers_entity
  ON public.compliance_fact_answers (organization_id, scope, entity_id);

ALTER TABLE public.compliance_fact_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_fact_answers_select ON public.compliance_fact_answers;
CREATE POLICY compliance_fact_answers_select
  ON public.compliance_fact_answers
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS compliance_fact_answers_write ON public.compliance_fact_answers;
CREATE POLICY compliance_fact_answers_write
  ON public.compliance_fact_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

DROP POLICY IF EXISTS compliance_fact_answers_update ON public.compliance_fact_answers;
CREATE POLICY compliance_fact_answers_update
  ON public.compliance_fact_answers
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

DROP POLICY IF EXISTS compliance_fact_answers_delete ON public.compliance_fact_answers;
CREATE POLICY compliance_fact_answers_delete
  ON public.compliance_fact_answers
  FOR DELETE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_compliance_fact_answers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_compliance_fact_answers ON public.compliance_fact_answers;
CREATE TRIGGER trg_touch_compliance_fact_answers
  BEFORE UPDATE ON public.compliance_fact_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_compliance_fact_answers_updated_at();

REVOKE ALL ON FUNCTION public.touch_compliance_fact_answers_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_compliance_fact_answers_updated_at() TO PUBLIC;
