CREATE TABLE public.evv_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.provider_tenants(id) ON DELETE SET NULL,
  staff_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  utah_medicaid_provider_id text NOT NULL,
  utah_medicaid_member_id text NOT NULL,
  service_type_code text NOT NULL,
  clock_in_timestamp timestamptz NOT NULL DEFAULT now(),
  clock_out_timestamp timestamptz,
  gps_in_coordinates jsonb NOT NULL,
  gps_out_coordinates jsonb,
  shift_entry_type text NOT NULL CHECK (shift_entry_type IN ('Client_Profile_Pass','General_Sidebar_Unscheduled')),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Active','Pending','Approved','Rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evv_timesheets_org_status ON public.evv_timesheets(organization_id, status);
CREATE INDEX idx_evv_timesheets_staff_active ON public.evv_timesheets(staff_id) WHERE clock_out_timestamp IS NULL;

ALTER TABLE public.evv_timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff insert own evv"
  ON public.evv_timesheets FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid() AND is_org_member(organization_id, auth.uid()));

CREATE POLICY "staff read own or managers read all evv"
  ON public.evv_timesheets FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "staff update own active evv"
  ON public.evv_timesheets FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (staff_id = auth.uid() OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers delete evv"
  ON public.evv_timesheets FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE TRIGGER evv_timesheets_touch_updated_at
  BEFORE UPDATE ON public.evv_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();