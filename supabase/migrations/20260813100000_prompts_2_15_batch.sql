-- Batch migration for PROMPT 2-15 (excluding 7 and 11, already satisfied).
-- Safe to run once; every statement is additive (new tables/columns/policies).

-- ── Prompt 8: fully customizable healthcare provider list ──────────────────
CREATE TABLE IF NOT EXISTS public.client_healthcare_providers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider_type    text NOT NULL,
  provider_name    text,
  phone            text,
  notes            text,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_healthcare_providers TO authenticated;
GRANT ALL ON public.client_healthcare_providers TO service_role;

ALTER TABLE public.client_healthcare_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read healthcare providers"
  ON public.client_healthcare_providers FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "admins manage healthcare providers"
  ON public.client_healthcare_providers FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_client_healthcare_providers_client
  ON public.client_healthcare_providers (client_id);

-- One-time backfill: migrate the old fixed PCP/specialist/prescriber columns
-- into the new open-ended provider rows as the default set. Safe to re-run —
-- guarded by NOT EXISTS on (client_id, provider_type).
INSERT INTO public.client_healthcare_providers (organization_id, client_id, provider_type, provider_name, phone, sort_order)
SELECT c.organization_id, c.id, 'Primary Care Physician', c.pcp_name, c.pcp_phone, 1
FROM public.clients c
WHERE c.pcp_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_healthcare_providers p
    WHERE p.client_id = c.id AND p.provider_type = 'Primary Care Physician'
  );

INSERT INTO public.client_healthcare_providers (organization_id, client_id, provider_type, provider_name, phone, sort_order)
SELECT c.organization_id, c.id, 'Specialist', c.specialist_name, c.specialist_phone, 2
FROM public.clients c
WHERE c.specialist_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_healthcare_providers p
    WHERE p.client_id = c.id AND p.provider_type = 'Specialist'
  );

INSERT INTO public.client_healthcare_providers (organization_id, client_id, provider_type, provider_name, phone, sort_order)
SELECT c.organization_id, c.id, 'Prescribing Provider', c.med_prescriber_name, c.med_prescriber_phone, 3
FROM public.clients c
WHERE c.med_prescriber_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_healthcare_providers p
    WHERE p.client_id = c.id AND p.provider_type = 'Prescribing Provider'
  );

-- ── Prompt 9: HHS hospitalization notes + RHS hospitalized/non-billable days ─
ALTER TABLE public.hhs_monthly_attendance
  ADD COLUMN IF NOT EXISTS away_notes text;

CREATE TABLE IF NOT EXISTS public.rhs_hospitalization_days (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  record_date      date NOT NULL,
  notes            text NOT NULL,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, record_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rhs_hospitalization_days TO authenticated;
GRANT ALL ON public.rhs_hospitalization_days TO service_role;

ALTER TABLE public.rhs_hospitalization_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read rhs hospitalization days"
  ON public.rhs_hospitalization_days FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "org members manage rhs hospitalization days"
  ON public.rhs_hospitalization_days FOR ALL TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_rhs_hosp_days_client
  ON public.rhs_hospitalization_days (client_id, record_date);

-- ── Prompt 13: HRC committee-meeting minutes document ───────────────────────
ALTER TABLE public.hrc_meetings
  ADD COLUMN IF NOT EXISTS minutes_document_path text,
  ADD COLUMN IF NOT EXISTS minutes_document_name text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hrc-documents',
  'hrc-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "hrc committee read minutes docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hrc-documents');

CREATE POLICY "hrc admins manage minutes docs"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'hrc-documents')
  WITH CHECK (bucket_id = 'hrc-documents');

-- ── Prompts 14/15: RHS quarterly evacuation drill log ───────────────────────
CREATE TABLE IF NOT EXISTS public.rhs_evacuation_drills (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  drill_date                  date NOT NULL,
  simulation_type             text NOT NULL DEFAULT 'Fire',
  duration_minutes            integer,
  participants                text,
  notes                       text,
  created_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rhs_evacuation_drills TO authenticated;
GRANT ALL ON public.rhs_evacuation_drills TO service_role;

ALTER TABLE public.rhs_evacuation_drills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read rhs drills"
  ON public.rhs_evacuation_drills FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "org members manage rhs drills"
  ON public.rhs_evacuation_drills FOR ALL TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_rhs_drills_client
  ON public.rhs_evacuation_drills (client_id, drill_date DESC);

-- ── Prompts 2/3/10/12: self-attestable baseline training carve-out ─────────
-- (staff_baseline_training_completions / document_attestations RLS policies
-- for self-attestation live in 20260813090000_staff_self_attest_baseline.sql)
