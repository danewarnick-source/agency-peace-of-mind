-- Phase 1: extend state_templates with the configurable surfaces
-- the platform currently hardcodes for Utah. Additive only — existing
-- columns/values are untouched so Utah behavior cannot regress.

ALTER TABLE public.state_templates
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '{"sections": []}'::jsonb,
  ADD COLUMN IF NOT EXISTS caps      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regulator JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Track structural (non-config) state differences NECTAR finds during
-- inventory. These deep-link to HIVE Exec tickets and never auto-resolve.
CREATE TABLE IF NOT EXISTS public.state_structural_gaps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code    TEXT NOT NULL,
  area          TEXT NOT NULL,
  summary       TEXT NOT NULL,
  detail        TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  ticket_id     UUID,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_structural_gaps TO authenticated;
GRANT ALL ON public.state_structural_gaps TO service_role;

ALTER TABLE public.state_structural_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HIVE executives manage structural gaps"
  ON public.state_structural_gaps
  FOR ALL
  TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE TRIGGER state_structural_gaps_touch
  BEFORE UPDATE ON public.state_structural_gaps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed Utah's reference values for the new sections. Mirrors the literals
-- currently embedded in app code/triggers — once Phase 2 wires reads
-- through the template, Utah's behavior stays identical.
UPDATE public.state_templates
SET
  citations = jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object('key','respite_caps',       'label','Respite caps',                 'cite','Section 7.4',  'url',null),
      jsonb_build_object('key','els_caps',           'label','ELS daily / annual caps',      'cite','Article 10',   'url',null),
      jsonb_build_object('key','pba_receipt',        'label','PBA receipt requirement',      'cite','Section 1.28', 'url',null),
      jsonb_build_object('key','belongings_discard', 'label','Belongings discard signature', 'cite','Section 11.3(5)','url',null),
      jsonb_build_object('key','evv_locations_cap',  'label','Approved EVV locations cap',   'cite','UT EVV rule',  'url',null)
    )
  ),
  caps = jsonb_build_object(
    'respite_max_consecutive_days', 14,
    'respite_annual_days',          21,
    'els_daily_units',              24,
    'els_annual_days',              260,
    'pba_receipt_threshold_usd',    50,
    'belongings_signature_threshold_usd', 50
  ),
  regulator = jsonb_build_object(
    'name_short',               'DSPD',
    'name_long',                'Division of Services for People with Disabilities',
    'parent_agency_short',      'DHHS',
    'parent_agency_long',       'Utah Department of Health and Human Services',
    'medicaid_program_name',    'Utah Medicaid',
    'submission_portal_url',    null,
    'incident_deadline_hours',  24
  )
WHERE state_code = 'UT';