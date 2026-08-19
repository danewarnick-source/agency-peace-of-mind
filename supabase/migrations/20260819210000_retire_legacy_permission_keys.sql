-- Retire the four coarse legacy permission keys that every route/server-fn
-- reference has now been migrated off of (see src/lib/rbac.ts):
--   manage_users   -> edit_staff_records (or view_staff_records/view_clients/etc.
--                      per-route, already applied in prior commits)
--   manage_schedule -> create_shifts (write) / view_schedule (read)
--   invite_users   -> invite_staff
--   remove_users   -> deactivate_staff
--
-- These four are removed from ALL_PERMISSIONS/DEFAULT_MATRIX in rbac.ts, so
-- seed_org_role_permissions() must stop seeding them (new orgs), and
-- existing role_permissions / user_permission_overrides rows for them are
-- cleaned up (no code path checks these keys anymore).

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
    -- Legacy (still gate a few non-route call sites -- see src/lib/rbac.ts)
    'manage_roles','assign_training',
    'create_courses','edit_courses','manage_certifications','manage_programs',
    'approve_external_certs','upload_external_certs','view_team_reports',
    'manage_organization','view_own_training','view_certifications',
    'view_platform_metrics','manage_all_orgs','view_financial_tns_gross',
    'view_financial_rhs','view_financial_employees','view_referrals',
    'manage_referrals','send_emails'
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
    'assign_training','view_team_reports','approve_external_certs',
    'upload_external_certs','view_own_training','view_certifications',
    'manage_incidents'
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

-- Clean up rows for the retired keys -- nothing in the codebase checks them
-- anymore, so leaving them around is just dead data in the matrix UI.
DELETE FROM public.role_permissions
  WHERE permission IN ('manage_users', 'manage_schedule', 'invite_users', 'remove_users');

DELETE FROM public.user_permission_overrides
  WHERE permission IN ('manage_users', 'manage_schedule', 'invite_users', 'remove_users');

-- has_permission()'s fallback CASE (only reachable when a role/permission
-- pair predates seed_org_role_permissions) drops the retired keys too, so
-- it can't accidentally grant them via the old admin/manager fallback list.
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
  -- for a permission/role pair that predates seed_org_role_permissions --
  -- every org now has a complete matrix, so this is effectively dead code
  -- kept for safety).
  RETURN CASE
    WHEN _role = 'admin'::app_role AND _perm IN (
      'manage_roles',
      'assign_training','create_courses','edit_courses','manage_certifications',
      'manage_programs','approve_external_certs','upload_external_certs',
      'export_reports','view_analytics','view_team_reports',
      'manage_billing','view_billing','manage_organization',
      'view_own_training','view_certifications',
      'view_financial_monthly_grid','view_financial_host_home',
      'view_financial_contractors','view_financial_totals','view_financial_tns_gross'
    ) THEN true
    WHEN _role = 'manager'::app_role AND _perm IN (
      'assign_training','view_team_reports','approve_external_certs',
      'upload_external_certs','view_analytics','view_own_training','view_certifications'
    ) THEN true
    WHEN _role = 'employee'::app_role AND _perm IN (
      'view_own_training','view_certifications','upload_external_certs'
    ) THEN true
    ELSE false
  END;
END;
$$;
