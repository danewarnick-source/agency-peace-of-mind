-- Permission system rebuild:
--   1) seed_org_role_permissions — writes a complete role_permissions matrix
--      for every org (mirrors DEFAULT_MATRIX in src/lib/rbac.ts), auto-run
--      on new org creation, backfilled for existing orgs.
--   2) user_permission_overrides — per-user grant/deny layer, replaces the
--      unused user_capability_overrides table (zero UI/server-fn references
--      in the codebase, safe to drop).
--   3) permission_audit_log — every role_permissions / override change.
--   4) role_permissions RLS hardening (explicit read/write policy split).
--   5) scope_assignments — per-supervisor data-scope restriction.

-- ============================================================
-- 1) Seed role_permissions from the DEFAULT_MATRIX
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_org_role_permissions(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _all_perms text[] := ARRAY[
    -- People
    'invite_staff','view_staff_records','edit_staff_records','manage_staff_roles',
    'deactivate_staff','view_staff_documents','upload_staff_documents','approve_staff_documents',
    -- Clients
    'view_clients','edit_client_records','manage_client_intake','view_client_medical',
    'edit_client_medical','view_client_documents','manage_client_documents','manage_client_goals',
    -- Scheduling
    'view_schedule','create_shifts','edit_shifts','delete_shifts',
    'approve_shift_swaps','manage_recurring_shifts',
    -- Timesheets
    'view_own_timesheets','view_team_timesheets','view_all_timesheets','approve_timesheets',
    'edit_timesheets','export_evv',
    -- Documentation
    'submit_shift_notes','edit_shift_notes','approve_shift_notes','view_daily_logs',
    'submit_daily_logs','approve_daily_logs','manage_forms','submit_forms',
    'view_form_submissions','approve_form_submissions',
    -- Compliance
    'view_compliance_dashboard','complete_obligations','file_staff_documents',
    'manage_obligations','view_audit_trail',
    -- Incidents
    'report_incidents','view_incidents','manage_incidents','export_incident_reports',
    -- Medications
    'view_emar','submit_emar','manage_medications',
    -- HRC
    'view_hrc','manage_hrc',
    -- Financial
    'view_billing','manage_billing','view_payroll','manage_payroll',
    'view_financial_reports','export_financial_reports',
    -- Organization
    'manage_organization_settings','manage_service_codes','view_analytics',
    'export_reports','manage_permissions',
    -- Legacy (still gate existing routes — see src/lib/rbac.ts)
    'manage_users','invite_users','remove_users','manage_roles','assign_training',
    'create_courses','edit_courses','manage_certifications','manage_programs',
    'approve_external_certs','upload_external_certs','view_team_reports',
    'manage_organization','view_own_training','view_certifications',
    'view_platform_metrics','manage_all_orgs','view_financial_tns_gross',
    'view_financial_rhs','view_financial_employees','view_referrals',
    'manage_referrals','send_emails','manage_schedule'
  ];
  _manager_perms text[] := ARRAY[
    'invite_staff','view_staff_records','view_staff_documents','upload_staff_documents',
    'view_clients','edit_client_records','view_client_medical','view_client_documents',
    'manage_client_documents','manage_client_goals',
    'view_schedule','create_shifts','edit_shifts','approve_shift_swaps',
    'view_own_timesheets','view_team_timesheets','approve_timesheets',
    'submit_shift_notes','edit_shift_notes','view_daily_logs','submit_daily_logs',
    'submit_forms','view_form_submissions',
    'view_compliance_dashboard','complete_obligations','file_staff_documents',
    'report_incidents','view_incidents',
    'view_emar','submit_emar',
    'view_hrc',
    'view_analytics',
    'invite_users','assign_training','view_team_reports','approve_external_certs',
    'upload_external_certs','view_own_training','view_certifications',
    'manage_schedule','manage_incidents'
  ];
  _employee_perms text[] := ARRAY[
    'view_own_timesheets','submit_shift_notes','submit_daily_logs',
    'submit_forms','complete_obligations',
    'report_incidents','view_emar','submit_emar',
    'view_own_training','view_certifications','upload_external_certs'
  ];
  _committee_perms text[] := ARRAY['view_hrc','manage_hrc'];
  _perm text;
BEGIN
  FOREACH _perm IN ARRAY _all_perms LOOP
    INSERT INTO public.role_permissions (organization_id, role, permission, enabled)
    VALUES
      (_org, 'admin', _perm, true),
      (_org, 'super_admin', _perm, true),
      (_org, 'manager', _perm, _perm = ANY(_manager_perms)),
      (_org, 'employee', _perm, _perm = ANY(_employee_perms)),
      (_org, 'committee_member', _perm, _perm = ANY(_committee_perms))
    ON CONFLICT (organization_id, role, permission) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_org_role_permissions(uuid) TO authenticated, service_role;

-- Backfill existing orgs (idempotent — ON CONFLICT DO NOTHING never touches
-- rows an org already customized)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_org_role_permissions(r.id);
  END LOOP;
END $$;

-- Auto-seed on new orgs
CREATE OR REPLACE FUNCTION public.trg_seed_role_permissions_on_new_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.seed_org_role_permissions(NEW.id); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS seed_role_permissions_after_org_insert ON public.organizations;
CREATE TRIGGER seed_role_permissions_after_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_role_permissions_on_new_org();

-- ============================================================
-- 2) user_permission_overrides (replaces unused user_capability_overrides)
-- ============================================================

DROP TABLE IF EXISTS public.user_capability_overrides CASCADE;

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean NOT NULL,
  granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_by_name text NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read org overrides"
  ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()));

CREATE POLICY "owners manage org overrides"
  ON public.user_permission_overrides FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()));

-- Users can read their own overrides (to render the effective permissions preview)
CREATE POLICY "users read own overrides"
  ON public.user_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_org
  ON public.user_permission_overrides(user_id, organization_id);

-- ============================================================
-- 3) permission_audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  changed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN (
    'role_permission_updated',
    'individual_override_granted',
    'individual_override_denied',
    'individual_override_removed',
    'individual_override_expired'
  )),
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_name text,
  role text,
  permission text NOT NULL,
  previous_value boolean,
  new_value boolean,
  reason text,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;

ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read permission audit"
  ON public.permission_audit_log FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()));

-- Insert via server functions only (service role); block direct user inserts
CREATE POLICY "no direct user inserts"
  ON public.permission_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_permission_audit_log_org_created
  ON public.permission_audit_log(organization_id, created_at DESC);

-- ============================================================
-- 4) role_permissions RLS hardening
-- ============================================================

DROP POLICY IF EXISTS "members read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "admins write role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "org members read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "owners write role permissions" ON public.role_permissions;

CREATE POLICY "org members read role permissions"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())
      OR public.is_super_admin(auth.uid()));

CREATE POLICY "owners write role permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()));

-- ============================================================
-- 5) scope_assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scope_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN (
    'service_code',
    'staff_group',
    'client',
    'all'
  )),
  scope_ref_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id, scope_type, scope_ref_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_assignments TO authenticated;
GRANT ALL ON public.scope_assignments TO service_role;

ALTER TABLE public.scope_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners manage scope assignments"
  ON public.scope_assignments FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
      OR public.is_super_admin(auth.uid()));

CREATE POLICY "users read own scope"
  ON public.scope_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_scope_assignments_user_org
  ON public.scope_assignments(user_id, organization_id);

-- ============================================================
-- 6) has_permission() — server-side authorization RPC (used by
--    src/lib/require-permission.ts across many server functions) now
--    checks the individual override layer before falling back to
--    role_permissions, so a granular server-enforced gate respects the
--    same two-layer resolution the client hook does.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _org_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
  _override boolean;
  _individual_override boolean;
BEGIN
  -- Individual override wins over everything, including the super_admin shortcut.
  SELECT granted INTO _individual_override
  FROM public.user_permission_overrides
  WHERE user_id = _user_id
    AND organization_id = _org_id
    AND permission = _perm
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF FOUND THEN
    RETURN _individual_override;
  END IF;

  -- super_admin shortcut (membership row in any role of type super_admin in this org)
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = 'super_admin'::app_role
  ) THEN
    RETURN true;
  END IF;

  SELECT role INTO _role
  FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1;

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  -- Org role configuration
  SELECT enabled INTO _override
  FROM public.role_permissions
  WHERE organization_id = _org_id
    AND role = _role
    AND permission = _perm
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(_override, false);
  END IF;

  -- Fallback: replicate DEFAULT_MATRIX from src/lib/rbac.ts (only reachable
  -- for a permission/role pair that predates seed_org_role_permissions —
  -- every org now has a complete matrix, so this is effectively dead code
  -- kept for safety).
  RETURN CASE
    WHEN _role = 'admin'::app_role AND _perm IN (
      'manage_users','invite_users','remove_users','manage_roles',
      'assign_training','create_courses','edit_courses','manage_certifications',
      'manage_programs','approve_external_certs','upload_external_certs',
      'export_reports','view_analytics','view_team_reports',
      'manage_billing','view_billing','manage_organization',
      'view_own_training','view_certifications',
      'view_financial_monthly_grid','view_financial_host_home',
      'view_financial_contractors','view_financial_totals','view_financial_tns_gross'
    ) THEN true
    WHEN _role = 'manager'::app_role AND _perm IN (
      'invite_users','assign_training','view_team_reports','approve_external_certs',
      'upload_external_certs','view_analytics','view_own_training','view_certifications'
    ) THEN true
    WHEN _role = 'employee'::app_role AND _perm IN (
      'view_own_training','view_certifications','upload_external_certs'
    ) THEN true
    ELSE false
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text) TO authenticated, service_role;

-- ============================================================
-- 7) notifications.type — allow the permission-request notification kind
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'incident_report_filed',
  'incident_deadline_warning',
  'timesheet_exception',
  'daily_log_exception',
  'open_shift_warning',
  'permission_requested'
));
