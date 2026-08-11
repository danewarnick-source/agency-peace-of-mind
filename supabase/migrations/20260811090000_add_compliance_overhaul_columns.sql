-- Authoritative Sources compliance overhaul: verification metadata on
-- nectar_requirements, the nectar_compliance_instances table, linking
-- columns on nectar_attestations, and Nectar-input columns on
-- general_shifts. Additive only. See docs/SQL_HANDOFF.md for the runnable
-- handoff version (this migration does not auto-apply to the live DB).

ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS verification_type text
    CHECK (verification_type IN ('internal','external')) DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS verification_type_source text
    CHECK (verification_type_source IN ('auto_regex','auto_ai','manual_override'))
    DEFAULT 'auto_regex',
  ADD COLUMN IF NOT EXISTS compliance_pattern text
    CHECK (compliance_pattern IN
      ('one_time','renewal','event_driven','ongoing_per_shift','continuous')),
  ADD COLUMN IF NOT EXISTS plain_language_explanation text,
  ADD COLUMN IF NOT EXISTS evidence_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feature_link jsonb;

CREATE TABLE IF NOT EXISTS public.nectar_compliance_instances (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id)       ON DELETE CASCADE,
  requirement_id   uuid        NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  triggered_by_id  uuid,
  triggered_by_kind text       CHECK (triggered_by_kind IN
                                 ('incident','shift','client_assignment','authorization','period','manual')),
  triggered_at     timestamptz NOT NULL DEFAULT now(),
  deadline_at      timestamptz NOT NULL,
  status           text        NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open','resolved','overdue')),
  resolved_at      timestamptz,
  resolved_by      uuid        REFERENCES public.profiles(id),
  resolved_via     text        CHECK (resolved_via IN ('auto','attestation','upload','both')),
  resolution_note  text,
  external_reference text,
  attestation_id   uuid        REFERENCES public.nectar_attestations(id),
  document_url     text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nectar_compliance_instances TO authenticated;
GRANT ALL                            ON public.nectar_compliance_instances TO service_role;

ALTER TABLE public.nectar_compliance_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nci_read" ON public.nectar_compliance_instances
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "nci_write" ON public.nectar_compliance_instances
  FOR ALL TO authenticated
  USING  (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_compliance_instances_org    ON public.nectar_compliance_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_instances_req    ON public.nectar_compliance_instances(requirement_id);
CREATE INDEX IF NOT EXISTS idx_compliance_instances_status ON public.nectar_compliance_instances(status);

ALTER TABLE public.nectar_attestations
  ADD COLUMN IF NOT EXISTS covers_instance_id uuid REFERENCES public.nectar_compliance_instances(id),
  ADD COLUMN IF NOT EXISTS original_staff_input text,
  ADD COLUMN IF NOT EXISTS nectar_expanded_output text,
  ADD COLUMN IF NOT EXISTS input_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS covers_staff_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS covers_client_id uuid REFERENCES public.clients(id);

-- Shift documentation table, confirmed via src/hooks/use-general-shift.tsx.
ALTER TABLE public.general_shifts
  ADD COLUMN IF NOT EXISTS nectar_raw_input text,
  ADD COLUMN IF NOT EXISTS nectar_attestation_id uuid REFERENCES public.nectar_attestations(id);
