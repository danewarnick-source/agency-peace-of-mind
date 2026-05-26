
-- ============================================================
-- HOST HOME SUPPORTS (HHS) MODULE — isolated from evv_timesheets
-- ============================================================

-- 1. hhs_daily_records: 24-hour narrative + AI feedback
CREATE TABLE public.hhs_daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  narrative TEXT NOT NULL,
  pcsp_goals_addressed TEXT[] NOT NULL DEFAULT '{}',
  ai_compliance_status TEXT,
  ai_compliance_feedback TEXT,
  signature_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_daily_records_lookup ON public.hhs_daily_records(organization_id, client_id, record_date DESC);
ALTER TABLE public.hhs_daily_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs daily" ON public.hhs_daily_records
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers insert own hhs daily" ON public.hhs_daily_records
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "providers update own hhs daily" ON public.hhs_daily_records
  FOR UPDATE TO authenticated USING (provider_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete hhs daily" ON public.hhs_daily_records
  FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- 2. hhs_emar_logs
CREATE TABLE public.hhs_emar_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  medication_id UUID,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  route TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  administered_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('Passed','Refused','Missed','Held')),
  is_prn BOOLEAN NOT NULL DEFAULT false,
  prn_reason TEXT,
  is_controlled BOOLEAN NOT NULL DEFAULT false,
  pill_count_verified BOOLEAN,
  pill_count_value INTEGER,
  exception_reason TEXT,
  signature_attestation TEXT,
  staff_name TEXT,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_emar_lookup ON public.hhs_emar_logs(organization_id, client_id, record_date DESC);
ALTER TABLE public.hhs_emar_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs emar" ON public.hhs_emar_logs
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers insert hhs emar" ON public.hhs_emar_logs
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers manage hhs emar" ON public.hhs_emar_logs
  FOR ALL TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid())) WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()));

-- 3. hhs_monthly_attendance
CREATE TABLE public.hhs_monthly_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  record_date DATE NOT NULL,
  presence_status TEXT NOT NULL CHECK (presence_status IN ('Present','Away')),
  away_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, record_date)
);
CREATE INDEX idx_hhs_attendance_lookup ON public.hhs_monthly_attendance(organization_id, client_id, record_date DESC);
ALTER TABLE public.hhs_monthly_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs attendance" ON public.hhs_monthly_attendance
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers write hhs attendance" ON public.hhs_monthly_attendance
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "providers update hhs attendance" ON public.hhs_monthly_attendance
  FOR UPDATE TO authenticated USING (provider_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete hhs attendance" ON public.hhs_monthly_attendance
  FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- 4. hhs_medical_logs
CREATE TABLE public.hhs_medical_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  appointment_at TIMESTAMPTZ NOT NULL,
  facility_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  orders_changes TEXT,
  follow_up_date DATE,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_medical_lookup ON public.hhs_medical_logs(organization_id, client_id, record_date DESC);
ALTER TABLE public.hhs_medical_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs medical" ON public.hhs_medical_logs
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers write hhs medical" ON public.hhs_medical_logs
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers manage hhs medical" ON public.hhs_medical_logs
  FOR ALL TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid())) WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()));

-- 5. hhs_monthly_summaries
CREATE TABLE public.hhs_monthly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  target_month DATE NOT NULL,
  pcsp_progress_narrative TEXT NOT NULL,
  community_outings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, target_month)
);
CREATE INDEX idx_hhs_summary_lookup ON public.hhs_monthly_summaries(organization_id, client_id, target_month DESC);
ALTER TABLE public.hhs_monthly_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs summary" ON public.hhs_monthly_summaries
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers write hhs summary" ON public.hhs_monthly_summaries
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "providers update hhs summary" ON public.hhs_monthly_summaries
  FOR UPDATE TO authenticated USING (provider_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete hhs summary" ON public.hhs_monthly_summaries
  FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- 6. hhs_incident_reports — internal Form C intake
CREATE TABLE public.hhs_incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  incident_categories TEXT[] NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  guardian_contact_method TEXT,
  guardian_contact_at TIMESTAMPTZ,
  guardian_response TEXT,
  protective_actions TEXT,
  status TEXT NOT NULL DEFAULT 'pending_admin_review' CHECK (status IN ('pending_admin_review','upi_filed','closed')),
  upi_reference_number TEXT,
  upi_filed_at TIMESTAMPTZ,
  upi_filed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_incidents_lookup ON public.hhs_incident_reports(organization_id, status, created_at DESC);
ALTER TABLE public.hhs_incident_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs incidents" ON public.hhs_incident_reports
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers insert hhs incidents" ON public.hhs_incident_reports
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers update hhs incidents" ON public.hhs_incident_reports
  FOR UPDATE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete hhs incidents" ON public.hhs_incident_reports
  FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- 7. hhs_client_inventories — $50+ valuables
CREATE TABLE public.hhs_client_inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  asset_description TEXT NOT NULL,
  estimated_value NUMERIC(10,2) NOT NULL,
  added_on DATE NOT NULL DEFAULT CURRENT_DATE,
  removed_on DATE,
  removal_reason TEXT,
  removal_signature TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_inventory_lookup ON public.hhs_client_inventories(organization_id, client_id);
ALTER TABLE public.hhs_client_inventories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs inventory" ON public.hhs_client_inventories
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers write hhs inventory" ON public.hhs_client_inventories
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "providers update hhs inventory" ON public.hhs_client_inventories
  FOR UPDATE TO authenticated USING (provider_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete hhs inventory" ON public.hhs_client_inventories
  FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));

-- 8. hhs_evacuation_drills
CREATE TABLE public.hhs_evacuation_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  drill_executed_at TIMESTAMPTZ NOT NULL,
  simulation_type TEXT NOT NULL CHECK (simulation_type IN ('Fire','Earthquake','Severe Weather','Other')),
  evacuation_duration_seconds INTEGER NOT NULL,
  notes TEXT,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_drills_lookup ON public.hhs_evacuation_drills(organization_id, client_id, drill_executed_at DESC);
ALTER TABLE public.hhs_evacuation_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs drills" ON public.hhs_evacuation_drills
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers write hhs drills" ON public.hhs_evacuation_drills
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers manage hhs drills" ON public.hhs_evacuation_drills
  FOR ALL TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid())) WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()));

-- 9. hhs_transfer_logs — cross-agency communication
CREATE TABLE public.hhs_transfer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  client_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  receiving_party TEXT NOT NULL,
  party_type TEXT NOT NULL CHECK (party_type IN ('School','Day Program','Respite','Other')),
  communication_summary TEXT NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hhs_transfers_lookup ON public.hhs_transfer_logs(organization_id, client_id, transferred_at DESC);
ALTER TABLE public.hhs_transfer_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read hhs transfers" ON public.hhs_transfer_logs
  FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "providers write hhs transfers" ON public.hhs_transfer_logs
  FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND is_org_member(organization_id, auth.uid()));
CREATE POLICY "managers manage hhs transfers" ON public.hhs_transfer_logs
  FOR ALL TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid())) WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()));

-- Touch updated_at on hhs_daily_records and hhs_incident_reports
CREATE TRIGGER touch_hhs_daily_records BEFORE UPDATE ON public.hhs_daily_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_hhs_incident_reports BEFORE UPDATE ON public.hhs_incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
