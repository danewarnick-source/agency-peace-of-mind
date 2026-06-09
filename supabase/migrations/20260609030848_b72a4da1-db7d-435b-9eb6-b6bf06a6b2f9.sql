
-- Shift reporting: narrative + structured fields saved per-shift (links to scheduled_shifts and optional evv_timesheets)
CREATE TABLE public.shift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scheduled_shift_id uuid REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  evv_timesheet_id uuid REFERENCES public.evv_timesheets(id) ON DELETE SET NULL,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  code_id uuid REFERENCES public.provider_authorized_codes(id) ON DELETE SET NULL,
  narrative text,
  incidents jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals_worked jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_reports TO authenticated;
GRANT ALL ON public.shift_reports TO service_role;
ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read shift_reports" ON public.shift_reports FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members write shift_reports" ON public.shift_reports FOR INSERT TO authenticated WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members update shift_reports" ON public.shift_reports FOR UPDATE TO authenticated USING (is_org_member(organization_id, auth.uid())) WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE POLICY "admins delete shift_reports" ON public.shift_reports FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));
CREATE TRIGGER shift_reports_set_updated_at BEFORE UPDATE ON public.shift_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_shift_reports_shift ON public.shift_reports(scheduled_shift_id);
CREATE INDEX idx_shift_reports_staff ON public.shift_reports(staff_id, created_at DESC);

-- Per-shift MAR administration records (reuses client_medications for the meds themselves)
CREATE TABLE public.shift_mar_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scheduled_shift_id uuid REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  evv_timesheet_id uuid REFERENCES public.evv_timesheets(id) ON DELETE SET NULL,
  client_medication_id uuid NOT NULL REFERENCES public.client_medications(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_time text,
  status text NOT NULL CHECK (status IN ('given','refused','missed','held')),
  administered_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_mar_entries TO authenticated;
GRANT ALL ON public.shift_mar_entries TO service_role;
ALTER TABLE public.shift_mar_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read shift_mar" ON public.shift_mar_entries FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members write shift_mar" ON public.shift_mar_entries FOR INSERT TO authenticated WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members update shift_mar" ON public.shift_mar_entries FOR UPDATE TO authenticated USING (is_org_member(organization_id, auth.uid())) WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE POLICY "admins delete shift_mar" ON public.shift_mar_entries FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));
CREATE TRIGGER shift_mar_set_updated_at BEFORE UPDATE ON public.shift_mar_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_shift_mar_shift ON public.shift_mar_entries(scheduled_shift_id);
CREATE INDEX idx_shift_mar_client ON public.shift_mar_entries(client_id, administered_at DESC);

-- Call-outs: staff reports unable to work; tracks coverage + acknowledgment lifecycle
CREATE TABLE public.shift_callouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scheduled_shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','manager_acknowledged','coverage_locked','resolved','cancelled')),
  manager_acknowledged_at timestamptz,
  manager_acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  coverage_locked_at timestamptz,
  coverage_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_callouts TO authenticated;
GRANT ALL ON public.shift_callouts TO service_role;
ALTER TABLE public.shift_callouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read callouts" ON public.shift_callouts FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members write callouts" ON public.shift_callouts FOR INSERT TO authenticated WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members update callouts" ON public.shift_callouts FOR UPDATE TO authenticated USING (is_org_member(organization_id, auth.uid())) WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE POLICY "admins delete callouts" ON public.shift_callouts FOR DELETE TO authenticated USING (is_org_admin_or_manager(organization_id, auth.uid()));
CREATE TRIGGER shift_callouts_set_updated_at BEFORE UPDATE ON public.shift_callouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_callouts_org_status ON public.shift_callouts(organization_id, status, created_at DESC);

-- Escalation audit log
CREATE TABLE public.callout_escalation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  callout_id uuid NOT NULL REFERENCES public.shift_callouts(id) ON DELETE CASCADE,
  step integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','push','sms','voice','email','system')),
  target_role text,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('sent','acknowledged','no_response','failed')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.callout_escalation_events TO authenticated;
GRANT ALL ON public.callout_escalation_events TO service_role;
ALTER TABLE public.callout_escalation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read escalation" ON public.callout_escalation_events FOR SELECT TO authenticated USING (is_org_member(organization_id, auth.uid()));
CREATE POLICY "org members write escalation" ON public.callout_escalation_events FOR INSERT TO authenticated WITH CHECK (is_org_member(organization_id, auth.uid()));
CREATE INDEX idx_escalation_callout ON public.callout_escalation_events(callout_id, created_at);
