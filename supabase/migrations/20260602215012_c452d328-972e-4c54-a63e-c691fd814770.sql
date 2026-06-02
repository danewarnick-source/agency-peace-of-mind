-- ============================================================================
-- Prompt 47: Multi-state platform foundation
-- State as a first-class, editable configuration layer.
-- ============================================================================

-- 1) platform_states: the 50 US states (one row per state)
CREATE TABLE public.platform_states (
  code              TEXT PRIMARY KEY,                 -- 'UT', 'CA', ...
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'coming_soon'
                    CHECK (status IN ('draft','active','coming_soon')),
  is_reference      BOOLEAN NOT NULL DEFAULT FALSE,
  regulator_label   TEXT,                              -- e.g. 'DSPD' for UT
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_states TO authenticated;
GRANT ALL ON public.platform_states TO service_role;

ALTER TABLE public.platform_states ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read the state catalog (used to render onboarding, badges)
CREATE POLICY "auth read platform_states"
  ON public.platform_states FOR SELECT
  TO authenticated USING (true);

-- Only HIVE Executives can write
CREATE POLICY "exec insert platform_states"
  ON public.platform_states FOR INSERT
  TO authenticated WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec update platform_states"
  ON public.platform_states FOR UPDATE
  TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec delete platform_states"
  ON public.platform_states FOR DELETE
  TO authenticated USING (public.is_hive_executive(auth.uid()));

CREATE TRIGGER platform_states_touch
  BEFORE UPDATE ON public.platform_states
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) state_templates: editable per-state configuration (terminology, training, EVV, codes, docs)
CREATE TABLE public.state_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code        TEXT NOT NULL UNIQUE REFERENCES public.platform_states(code) ON DELETE CASCADE,
  version           INTEGER NOT NULL DEFAULT 1,
  -- JSONB sections so we can extend without schema churn
  terminology       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { department_name, regulator, role_labels, service_labels }
  training          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { mandates: [{ slug, cadence_months, roles[] }] }
  billing_codes     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { codes: [{ code, name, unit_type, evv_required }] }
  evv               JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { default_geofence_feet, variance_grace_minutes, reconciliation_policy, approved_locations_cap }
  required_documents JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { docs: [{ slug, cadence, attestor }] }
  department_structure JSONB NOT NULL DEFAULT '{}'::jsonb,-- { agency_types[], program_levels[] }
  draft             JSONB NOT NULL DEFAULT '{}'::jsonb,   -- in-progress edits not yet published
  published_at      TIMESTAMPTZ,
  published_by      UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.state_templates TO authenticated;
GRANT ALL ON public.state_templates TO service_role;

ALTER TABLE public.state_templates ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read published rows (their app reads its state's config).
-- HIVE Executives can read drafts too.
CREATE POLICY "auth read published state_templates"
  ON public.state_templates FOR SELECT
  TO authenticated
  USING (published_at IS NOT NULL OR public.is_hive_executive(auth.uid()));

CREATE POLICY "exec insert state_templates"
  ON public.state_templates FOR INSERT
  TO authenticated WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec update state_templates"
  ON public.state_templates FOR UPDATE
  TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec delete state_templates"
  ON public.state_templates FOR DELETE
  TO authenticated USING (public.is_hive_executive(auth.uid()));

CREATE TRIGGER state_templates_touch
  BEFORE UPDATE ON public.state_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) state_requirement_sources: authoritative docs uploaded per state (NECTAR parses these)
CREATE TABLE public.state_requirement_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code      TEXT NOT NULL REFERENCES public.platform_states(code) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  jurisdiction    TEXT,
  storage_path    TEXT,                              -- nectar-documents bucket path
  source_type     TEXT NOT NULL DEFAULT 'authoritative'
                  CHECK (source_type IN ('authoritative','reference','supplemental')),
  parse_status    TEXT NOT NULL DEFAULT 'pending'
                  CHECK (parse_status IN ('pending','parsing','parsed','error')),
  parse_error     TEXT,
  derived_count   INTEGER NOT NULL DEFAULT 0,
  uploaded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX state_req_sources_state_idx ON public.state_requirement_sources(state_code);

GRANT SELECT ON public.state_requirement_sources TO authenticated;
GRANT ALL ON public.state_requirement_sources TO service_role;

ALTER TABLE public.state_requirement_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exec read state_requirement_sources"
  ON public.state_requirement_sources FOR SELECT
  TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec insert state_requirement_sources"
  ON public.state_requirement_sources FOR INSERT
  TO authenticated WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec update state_requirement_sources"
  ON public.state_requirement_sources FOR UPDATE
  TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec delete state_requirement_sources"
  ON public.state_requirement_sources FOR DELETE
  TO authenticated USING (public.is_hive_executive(auth.uid()));

CREATE TRIGGER state_req_sources_touch
  BEFORE UPDATE ON public.state_requirement_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) state_derived_requirements: NECTAR-parsed requirement rows scoped to a state
CREATE TABLE public.state_derived_requirements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code      TEXT NOT NULL REFERENCES public.platform_states(code) ON DELETE CASCADE,
  source_id       UUID REFERENCES public.state_requirement_sources(id) ON DELETE SET NULL,
  requirement_key TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT,                              -- 'training','documentation','evv','billing','staffing','incident',...
  source_citation TEXT,
  jurisdiction    TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX state_derived_req_state_idx ON public.state_derived_requirements(state_code);
CREATE INDEX state_derived_req_source_idx ON public.state_derived_requirements(source_id);

GRANT SELECT ON public.state_derived_requirements TO authenticated;
GRANT ALL ON public.state_derived_requirements TO service_role;

ALTER TABLE public.state_derived_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read state_derived_requirements"
  ON public.state_derived_requirements FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "exec insert state_derived_requirements"
  ON public.state_derived_requirements FOR INSERT
  TO authenticated WITH CHECK (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec update state_derived_requirements"
  ON public.state_derived_requirements FOR UPDATE
  TO authenticated USING (public.is_hive_executive(auth.uid()));
CREATE POLICY "exec delete state_derived_requirements"
  ON public.state_derived_requirements FOR DELETE
  TO authenticated USING (public.is_hive_executive(auth.uid()));

-- 5) Extend organizations with state_code (+ optional multi-state list)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS state_code TEXT REFERENCES public.platform_states(code),
  ADD COLUMN IF NOT EXISTS additional_state_codes TEXT[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS organizations_state_code_idx ON public.organizations(state_code);

-- 6) Seed all 50 states. UT is active + reference; all others coming_soon.
INSERT INTO public.platform_states (code, name, status, is_reference, regulator_label) VALUES
  ('AL','Alabama','coming_soon',FALSE,NULL),
  ('AK','Alaska','coming_soon',FALSE,NULL),
  ('AZ','Arizona','coming_soon',FALSE,NULL),
  ('AR','Arkansas','coming_soon',FALSE,NULL),
  ('CA','California','coming_soon',FALSE,NULL),
  ('CO','Colorado','coming_soon',FALSE,NULL),
  ('CT','Connecticut','coming_soon',FALSE,NULL),
  ('DE','Delaware','coming_soon',FALSE,NULL),
  ('FL','Florida','coming_soon',FALSE,NULL),
  ('GA','Georgia','coming_soon',FALSE,NULL),
  ('HI','Hawaii','coming_soon',FALSE,NULL),
  ('ID','Idaho','coming_soon',FALSE,NULL),
  ('IL','Illinois','coming_soon',FALSE,NULL),
  ('IN','Indiana','coming_soon',FALSE,NULL),
  ('IA','Iowa','coming_soon',FALSE,NULL),
  ('KS','Kansas','coming_soon',FALSE,NULL),
  ('KY','Kentucky','coming_soon',FALSE,NULL),
  ('LA','Louisiana','coming_soon',FALSE,NULL),
  ('ME','Maine','coming_soon',FALSE,NULL),
  ('MD','Maryland','coming_soon',FALSE,NULL),
  ('MA','Massachusetts','coming_soon',FALSE,NULL),
  ('MI','Michigan','coming_soon',FALSE,NULL),
  ('MN','Minnesota','coming_soon',FALSE,NULL),
  ('MS','Mississippi','coming_soon',FALSE,NULL),
  ('MO','Missouri','coming_soon',FALSE,NULL),
  ('MT','Montana','coming_soon',FALSE,NULL),
  ('NE','Nebraska','coming_soon',FALSE,NULL),
  ('NV','Nevada','coming_soon',FALSE,NULL),
  ('NH','New Hampshire','coming_soon',FALSE,NULL),
  ('NJ','New Jersey','coming_soon',FALSE,NULL),
  ('NM','New Mexico','coming_soon',FALSE,NULL),
  ('NY','New York','coming_soon',FALSE,NULL),
  ('NC','North Carolina','coming_soon',FALSE,NULL),
  ('ND','North Dakota','coming_soon',FALSE,NULL),
  ('OH','Ohio','coming_soon',FALSE,NULL),
  ('OK','Oklahoma','coming_soon',FALSE,NULL),
  ('OR','Oregon','coming_soon',FALSE,NULL),
  ('PA','Pennsylvania','coming_soon',FALSE,NULL),
  ('RI','Rhode Island','coming_soon',FALSE,NULL),
  ('SC','South Carolina','coming_soon',FALSE,NULL),
  ('SD','South Dakota','coming_soon',FALSE,NULL),
  ('TN','Tennessee','coming_soon',FALSE,NULL),
  ('TX','Texas','coming_soon',FALSE,NULL),
  ('UT','Utah','active',TRUE,'DSPD'),
  ('VT','Vermont','coming_soon',FALSE,NULL),
  ('VA','Virginia','coming_soon',FALSE,NULL),
  ('WA','Washington','coming_soon',FALSE,NULL),
  ('WV','West Virginia','coming_soon',FALSE,NULL),
  ('WI','Wisconsin','coming_soon',FALSE,NULL),
  ('WY','Wyoming','coming_soon',FALSE,NULL)
ON CONFLICT (code) DO NOTHING;

-- 7) Seed Utah template — derived from existing platform behavior so swapping
--    hardcoded constants for template lookups doesn't change runtime behavior.
INSERT INTO public.state_templates (
  state_code, terminology, training, billing_codes, evv,
  required_documents, department_structure, published_at, published_by
) VALUES (
  'UT',
  jsonb_build_object(
    'department_name','Division of Services for People with Disabilities',
    'regulator','DSPD',
    'role_labels', jsonb_build_object(
      'direct_support','Direct Support Professional',
      'qa','QA / Compliance',
      'admin','Administrator'
    ),
    'service_labels', jsonb_build_object(
      'host_home','Host Home',
      'day_program','Day Program',
      'supported_living','Supported Living'
    )
  ),
  jsonb_build_object(
    'mandates', jsonb_build_array(
      jsonb_build_object('slug','dspd-orientation','name','DSPD Orientation','cadence_months', NULL, 'roles', ARRAY['employee','manager','admin']),
      jsonb_build_object('slug','medication-administration','name','Medication Administration','cadence_months', 12, 'roles', ARRAY['employee','manager']),
      jsonb_build_object('slug','cpr-first-aid','name','CPR & First Aid','cadence_months', 24, 'roles', ARRAY['employee','manager','admin']),
      jsonb_build_object('slug','hipaa','name','HIPAA Privacy','cadence_months', 12, 'roles', ARRAY['employee','manager','admin']),
      jsonb_build_object('slug','incident-reporting','name','Incident Reporting','cadence_months', 12, 'roles', ARRAY['employee','manager','admin'])
    )
  ),
  jsonb_build_object(
    'codes', jsonb_build_array(
      jsonb_build_object('code','S5125','name','Supported Living (per 15 min)','unit_type','15min','evv_required',true),
      jsonb_build_object('code','T1019','name','Personal Care (per 15 min)','unit_type','15min','evv_required',true),
      jsonb_build_object('code','T2017','name','Day Habilitation (per 15 min)','unit_type','15min','evv_required',true),
      jsonb_build_object('code','HHS','name','Host Home Services (per diem)','unit_type','daily','evv_required',false),
      jsonb_build_object('code','RHS','name','Residential Habilitation (per diem)','unit_type','daily','evv_required',false),
      jsonb_build_object('code','DSG','name','Day Support Group (per diem)','unit_type','daily','evv_required',false),
      jsonb_build_object('code','RL6','name','Respite Level 6','unit_type','daily','evv_required',false),
      jsonb_build_object('code','RP3','name','Respite Plan 3','unit_type','daily','evv_required',false),
      jsonb_build_object('code','RP4','name','Respite Plan 4','unit_type','daily','evv_required',false),
      jsonb_build_object('code','RP5','name','Respite Plan 5','unit_type','daily','evv_required',false)
    )
  ),
  jsonb_build_object(
    'default_geofence_feet', 500,
    'variance_grace_minutes', 7,
    'approved_locations_cap', 5,
    'reconciliation_policy','Shifts outside approved geofences require staff reason at clock-in/out and admin attestation in the EVV Reconciliation queue.'
  ),
  jsonb_build_object(
    'docs', jsonb_build_array(
      jsonb_build_object('slug','person-centered-plan','name','Person-Centered Plan','cadence','annual','attestor','admin'),
      jsonb_build_object('slug','behavior-support-plan','name','Behavior Support Plan','cadence','annual','attestor','admin'),
      jsonb_build_object('slug','medication-list','name','Medication List','cadence','as_changes','attestor','nurse'),
      jsonb_build_object('slug','incident-report','name','Incident Report','cadence','as_needed','attestor','admin')
    )
  ),
  jsonb_build_object(
    'agency_types', ARRAY['Supported Living','Host Home','Day Program','Respite'],
    'program_levels', ARRAY['Level 1','Level 2','Level 3','Level 4']
  ),
  now(),
  NULL
)
ON CONFLICT (state_code) DO NOTHING;

-- 8) Backfill all existing organizations to UT (the reference state).
UPDATE public.organizations
   SET state_code = 'UT'
 WHERE state_code IS NULL;

-- 9) Audit log for state template changes (reuses existing hive_executive_audit_log model semantics)
-- (No new table — Executive route handlers will write to hive_executive_audit_log with action='state_template_publish' etc.)