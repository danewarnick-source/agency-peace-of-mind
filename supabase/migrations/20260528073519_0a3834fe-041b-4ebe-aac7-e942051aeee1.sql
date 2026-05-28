-- Blueprint 04: Critical Bug Fixes

ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by  UUID;

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_approved
  ON public.evv_timesheets (organization_id, approved_at DESC)
  WHERE status = 'Approved';

DROP POLICY IF EXISTS "admins approve daily logs" ON public.daily_logs;
CREATE POLICY "admins approve daily logs"
  ON public.daily_logs FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_org_admin_or_manager(organization_id, auth.uid())
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_org_admin_or_manager(organization_id, auth.uid())
    OR is_super_admin(auth.uid())
  );