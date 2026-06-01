
CREATE TABLE IF NOT EXISTS public.shift_completeness_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  shift_id uuid NOT NULL REFERENCES public.evv_timesheets(id) ON DELETE CASCADE,
  client_id uuid,
  staff_id uuid NOT NULL,
  flag_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('soft','hard')),
  message text NOT NULL CHECK (length(message) BETWEEN 3 AND 1000),
  fix_route text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed_with_reason')),
  dismissal_reason text CHECK (dismissal_reason IS NULL OR length(dismissal_reason) <= 1000),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scf_org_status ON public.shift_completeness_flags(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_scf_shift ON public.shift_completeness_flags(shift_id);

GRANT SELECT, INSERT, UPDATE ON public.shift_completeness_flags TO authenticated;
GRANT ALL ON public.shift_completeness_flags TO service_role;

ALTER TABLE public.shift_completeness_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read completeness flags"
  ON public.shift_completeness_flags FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "staff insert own completeness flags"
  ON public.shift_completeness_flags FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND staff_id = auth.uid()
  );

CREATE POLICY "admins resolve completeness flags"
  ON public.shift_completeness_flags FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE TRIGGER trg_scf_updated_at
  BEFORE UPDATE ON public.shift_completeness_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
