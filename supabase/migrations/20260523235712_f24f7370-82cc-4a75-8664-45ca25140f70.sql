-- staff_assignments: caseload mapping between staff (profiles.id) and clients
CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (staff_id, client_id)
);
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read staff assignments"
  ON public.staff_assignments FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write staff assignments"
  ON public.staff_assignments FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_staff_assign_staff ON public.staff_assignments (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_assign_client ON public.staff_assignments (client_id);

-- daily_logs: add approval workflow
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- scheduled_shifts: admin calendar planning
CREATE TABLE IF NOT EXISTS public.scheduled_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  client_id uuid NOT NULL,
  job_code text,
  shift_type text NOT NULL DEFAULT 'hourly', -- 'hourly' | 'daily_host_home'
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.scheduled_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read schedule"
  ON public.scheduled_shifts FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write schedule"
  ON public.scheduled_shifts FOR ALL TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sched_org_start ON public.scheduled_shifts (organization_id, starts_at);
