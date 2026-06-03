
-- Versioning the generic HIVE base template (the state-neutral structure)
-- and stamping each state's filled-in template with the base version it was built from.

CREATE TABLE public.hive_base_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  changelog jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Schema snapshot: list of sections + the field keys each section exposes.
  -- Used to compute what is new/changed when a state upgrades.
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_current boolean NOT NULL DEFAULT false,
  released_at timestamp with time zone NOT NULL DEFAULT now(),
  released_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hive_base_template_versions TO authenticated;
GRANT ALL ON public.hive_base_template_versions TO service_role;

ALTER TABLE public.hive_base_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read base template versions"
  ON public.hive_base_template_versions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "exec insert base template versions"
  ON public.hive_base_template_versions FOR INSERT
  TO authenticated WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE POLICY "exec update base template versions"
  ON public.hive_base_template_versions FOR UPDATE
  TO authenticated USING (public.is_hive_executive(auth.uid()));

-- Only one version may be flagged current at a time.
CREATE UNIQUE INDEX hive_base_template_versions_one_current
  ON public.hive_base_template_versions (is_current)
  WHERE is_current = true;

-- Seed v1 — the structure we ship today.
INSERT INTO public.hive_base_template_versions (version, title, summary, changelog, schema, is_current)
VALUES (
  1,
  'v1 — Initial HIVE base template',
  'Initial extraction of the state-neutral structure. Utah is the fully populated reference instance.',
  '[
    {"type":"added","section":"terminology","field":"department_name","note":"State department / division display name"},
    {"type":"added","section":"regulator","field":"name_short","note":"Regulator short name"},
    {"type":"added","section":"regulator","field":"name_long","note":"Regulator long name"},
    {"type":"added","section":"regulator","field":"parent_agency_short"},
    {"type":"added","section":"regulator","field":"parent_agency_long"},
    {"type":"added","section":"regulator","field":"medicaid_program_name"},
    {"type":"added","section":"regulator","field":"submission_portal_url"},
    {"type":"added","section":"regulator","field":"incident_deadline_hours"},
    {"type":"added","section":"billing_codes","field":"codes"},
    {"type":"added","section":"forms","field":"forms"},
    {"type":"added","section":"training","field":"mandates"},
    {"type":"added","section":"evv","field":"default_geofence_feet"},
    {"type":"added","section":"evv","field":"variance_grace_minutes"},
    {"type":"added","section":"evv","field":"approved_locations_cap"},
    {"type":"added","section":"evv","field":"reconciliation_policy"},
    {"type":"added","section":"caps","field":"respite_max_consecutive_days"},
    {"type":"added","section":"caps","field":"respite_annual_days"},
    {"type":"added","section":"caps","field":"els_daily_units"},
    {"type":"added","section":"caps","field":"els_annual_days"},
    {"type":"added","section":"caps","field":"pba_receipt_threshold_usd"},
    {"type":"added","section":"caps","field":"belongings_signature_threshold_usd"},
    {"type":"added","section":"citations","field":"sections"},
    {"type":"added","section":"required_documents","field":"docs"},
    {"type":"added","section":"department_structure","field":"agency_types"},
    {"type":"added","section":"department_structure","field":"program_levels"}
  ]'::jsonb,
  '{
    "sections":[
      {"key":"terminology","fields":["department_name","regulator","role_labels","service_labels"]},
      {"key":"regulator","fields":["name_short","name_long","parent_agency_short","parent_agency_long","medicaid_program_name","submission_portal_url","incident_deadline_hours"]},
      {"key":"billing_codes","fields":["codes"]},
      {"key":"forms","fields":["forms"]},
      {"key":"training","fields":["mandates"]},
      {"key":"evv","fields":["default_geofence_feet","variance_grace_minutes","approved_locations_cap","reconciliation_policy"]},
      {"key":"caps","fields":["respite_max_consecutive_days","respite_annual_days","els_daily_units","els_annual_days","pba_receipt_threshold_usd","belongings_signature_threshold_usd"]},
      {"key":"citations","fields":["sections"]},
      {"key":"required_documents","fields":["docs"]},
      {"key":"department_structure","fields":["agency_types","program_levels"]}
    ]
  }'::jsonb,
  true
);

-- Stamp each state's filled-in template with the base version it was built from.
ALTER TABLE public.state_templates
  ADD COLUMN IF NOT EXISTS base_template_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_template_upgraded_at timestamp with time zone;

-- Existing rows (Utah) were built on v1 by definition.
UPDATE public.state_templates SET base_template_version = 1 WHERE base_template_version IS NULL;
