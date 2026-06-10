
-- =========================================================
-- time_off_requests
-- =========================================================
CREATE TABLE public.time_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL DEFAULT 'pto',
  note text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_off_requests_status_check
    CHECK (status IN ('pending','approved','denied','cancelled')),
  CONSTRAINT time_off_requests_type_check
    CHECK (type IN ('pto','sick','personal','unpaid','other')),
  CONSTRAINT time_off_requests_range_check
    CHECK (end_date >= start_date)
);

CREATE INDEX idx_time_off_org_status
  ON public.time_off_requests (organization_id, status, start_date);
CREATE INDEX idx_time_off_staff
  ON public.time_off_requests (staff_id, start_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_off_requests TO authenticated;
GRANT ALL ON public.time_off_requests TO service_role;

ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read own time off"
  ON public.time_off_requests FOR SELECT TO authenticated
  USING (staff_id = auth.uid() AND is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins read org time off"
  ON public.time_off_requests FOR SELECT TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "staff create own time off"
  ON public.time_off_requests FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = auth.uid()
    AND is_org_member(organization_id, auth.uid())
    AND status = 'pending'
  );

CREATE POLICY "staff cancel own pending time off"
  ON public.time_off_requests FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() AND status = 'pending')
  WITH CHECK (staff_id = auth.uid() AND status IN ('pending','cancelled'));

CREATE POLICY "admins manage org time off"
  ON public.time_off_requests FOR UPDATE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "admins delete org time off"
  ON public.time_off_requests FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER time_off_requests_set_updated_at
  BEFORE UPDATE ON public.time_off_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- shift_swap_requests
-- =========================================================
CREATE TABLE public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  from_staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_swap_requests_status_check
    CHECK (status IN ('pending','approved','denied','cancelled'))
);

CREATE INDEX idx_swap_org_status
  ON public.shift_swap_requests (organization_id, status, created_at DESC);
CREATE INDEX idx_swap_shift
  ON public.shift_swap_requests (shift_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_swap_requests TO authenticated;
GRANT ALL ON public.shift_swap_requests TO service_role;

ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read own swaps"
  ON public.shift_swap_requests FOR SELECT TO authenticated
  USING (
    (from_staff_id = auth.uid() OR to_staff_id = auth.uid())
    AND is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "admins read org swaps"
  ON public.shift_swap_requests FOR SELECT TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "staff create own swaps"
  ON public.shift_swap_requests FOR INSERT TO authenticated
  WITH CHECK (
    from_staff_id = auth.uid()
    AND is_org_member(organization_id, auth.uid())
    AND status = 'pending'
  );

CREATE POLICY "staff cancel own pending swaps"
  ON public.shift_swap_requests FOR UPDATE TO authenticated
  USING (from_staff_id = auth.uid() AND status = 'pending')
  WITH CHECK (from_staff_id = auth.uid() AND status IN ('pending','cancelled'));

CREATE POLICY "admins manage org swaps"
  ON public.shift_swap_requests FOR UPDATE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "admins delete org swaps"
  ON public.shift_swap_requests FOR DELETE TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER shift_swap_requests_set_updated_at
  BEFORE UPDATE ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
