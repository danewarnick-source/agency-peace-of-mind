-- 1. feature_registry
CREATE TABLE public.feature_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  parent_key text REFERENCES public.feature_registry(feature_key) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'tab' CHECK (category IN ('tab','subtab','nectar_feature')),
  default_enabled boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feature_registry TO authenticated;
GRANT ALL ON public.feature_registry TO service_role;

ALTER TABLE public.feature_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any authenticated user can read registry"
  ON public.feature_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only HIVE executives can write registry"
  ON public.feature_registry FOR ALL
  TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE TRIGGER trg_feature_registry_updated_at
  BEFORE UPDATE ON public.feature_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. organization_features
CREATE TABLE public.organization_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.feature_registry(feature_key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, feature_key)
);

CREATE INDEX idx_org_features_org ON public.organization_features(organization_id);

GRANT SELECT ON public.organization_features TO authenticated;
GRANT ALL ON public.organization_features TO service_role;

ALTER TABLE public.organization_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read their org's features"
  ON public.organization_features FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_hive_executive(auth.uid()));

CREATE POLICY "Only HIVE executives can write org features"
  ON public.organization_features FOR ALL
  TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE TRIGGER trg_org_features_updated_at
  BEFORE UPDATE ON public.organization_features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Seed top-level tabs
INSERT INTO public.feature_registry (feature_key, label, description, category, default_enabled, sort_order) VALUES
  ('hive_training',      'HIVE Training',            'DSPD-aligned course library, competency sign-off, verifiable certificates.',       'tab', false, 10),
  ('nectar',             'NECTAR',                   'NECTAR AI infusion — guided mode, plain-language answers, accelerated controls.',   'tab', false, 20),
  ('state_audit',        'State Audit',              'Audit-prep / QA readiness engine with findings & auditor share packets.',           'tab', false, 30),
  ('pba_ledgers',        'PBA Ledgers',              'Personal Budget Assistance accounts, transactions, monthly financial statements.',  'tab', true,  40),
  ('evv_timesheets',     'EVV / Timesheets',         'Electronic Visit Verification, timesheets, UEVV transmissions.',                    'tab', true,  50),
  ('client_intake',      'Client Intake & Discharge','Client intake workflows, checklists, discharge tracking.',                          'tab', true,  60),
  ('pcsp',               'PCSP',                     'Person-Centered Support Plans — authoring, review, distribution.',                  'tab', true,  70),
  ('staff_onboarding',   'Staff Onboarding/Training','Staff onboarding workflows and training program tracking.',                         'tab', true,  80);
