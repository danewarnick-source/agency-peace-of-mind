
CREATE TABLE public.system_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.system_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authed reads system_features"
  ON public.system_features FOR SELECT TO authenticated USING (true);

CREATE POLICY "super admins manage system_features"
  ON public.system_features FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.tenant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.provider_tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.system_features(feature_key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_key)
);

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins manage tenant_features"
  ON public.tenant_features FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant owner reads own tenant_features"
  ON public.tenant_features FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.provider_tenants t
    WHERE t.id = tenant_features.tenant_id
      AND lower(t.owner_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  ));

CREATE INDEX idx_tenant_features_tenant ON public.tenant_features(tenant_id);

INSERT INTO public.system_features (feature_key, feature_name, category, sort_order) VALUES
  ('overview', 'Overview Dashboard', 'Core', 1),
  ('time_clock', 'Time Clock', 'Workforce', 2),
  ('daily_notes', 'Daily Notes & Logs', 'Documentation', 3),
  ('scheduler', 'Scheduler', 'Workforce', 4),
  ('submissions', 'Submissions', 'Documentation', 5),
  ('audit_portal', 'Audit Portal', 'Compliance', 6),
  ('dspd_controls', 'DSPD Controls', 'Compliance', 7),
  ('emar_pass', 'Electronic MAR Pass', 'Clinical', 8),
  ('emar_audit', 'eMAR Audit Ledger', 'Compliance', 9),
  ('pba_trust_ledger', 'PBA Trust Ledger', 'Financial', 10),
  ('employees', 'Employees Registry', 'Roster', 11),
  ('clients', 'Clients Registry', 'Roster', 12),
  ('teams_homes', 'Teams & Homes', 'Roster', 13),
  ('ai_assistance', 'AI Assistance', 'Intelligence', 14);
