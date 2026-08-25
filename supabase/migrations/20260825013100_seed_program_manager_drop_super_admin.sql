-- Uses program_manager (added in 20260825013000). Must be a separate
-- migration so the enum value is committed before this transaction uses it.

DELETE FROM public.role_permissions WHERE role = 'super_admin';

CREATE OR REPLACE FUNCTION public.seed_org_role_permissions(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _all_perms text[] := ARRAY[
    'invite_staff','view_staff_records','edit_staff_records','manage_staff_roles',
    'deactivate_staff','view_staff_documents','upload_staff_documents','approve_staff_documents',
    'view_clients','edit_client_records','manage_client_intake','view_client_medical',
    'edit_client_medical','view_client_documents','manage_client_documents','manage_client_goals',
    'view_schedule','create_shifts','edit_shifts','delete_shifts',
    'approve_shift_swaps','manage_recurring_shifts',
    'view_own_timesheets','view_team_timesheets','view_all_timesheets','approve_timesheets',
    'edit_timesheets','export_evv',
    'submit_shift_notes','edit_shift_notes','approve_shift_notes','view_daily_logs',
    'submit_daily_logs','approve_daily_logs','manage_forms','submit_forms',
    'view_form_submissions','approve_form_submissions',
    'view_compliance_dashboard','complete_obligations','file_staff_documents',
    'manage_obligations','view_audit_trail',
    'report_incidents','view_incidents','manage_incidents','export_incident_reports',
    'view_emar','submit_emar','manage_medications',
    'view_hrc','manage_hrc',
    'view_billing','manage_billing','view_payroll','manage_payroll',
    'view_financial_reports','export_financial_reports',
    'manage_organization_settings','manage_service_codes','view_analytics',
    'export_reports','manage_permissions',
    'manage_roles','assign_training',
    'create_courses','edit_courses','manage_certifications','manage_programs',
    'approve_external_certs','upload_external_certs','view_team_reports',
    'manage_organization','view_own_training','view_certifications',
    'view_platform_metrics','manage_all_orgs','view_financial_tns_gross',
    'view_financial_rhs','view_financial_employees','view_referrals',
    'manage_referrals','send_emails'
  ];
  _program_manager_perms text[] := ARRAY[
    'invite_staff','view_staff_records','edit_staff_records',
    'view_staff_documents','upload_staff_documents','approve_staff_documents',
    'view_clients','edit_client_records','manage_client_intake','view_client_medical',
    'view_client_documents','manage_client_documents','manage_client_goals',
    'view_schedule','create_shifts','edit_shifts','delete_shifts',
    'approve_shift_swaps','manage_recurring_shifts',
    'view_own_timesheets','view_team_timesheets','view_all_timesheets','approve_timesheets',
    'edit_timesheets','export_evv',
    'submit_shift_notes','edit_shift_notes','approve_shift_notes','view_daily_logs',
    'submit_daily_logs','approve_daily_logs','submit_forms','view_form_submissions',
    'approve_form_submissions',
    'view_compliance_dashboard','complete_obligations','file_staff_documents',
    'manage_obligations',
    'report_incidents','view_incidents','manage_incidents',
    'view_emar','submit_emar',
    'view_hrc','manage_hrc',
    'view_billing','view_payroll','view_analytics','export_reports'
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
      (_org, 'program_manager', _perm, _perm = ANY(_program_manager_perms)),
      (_org, 'manager', _perm, _perm = ANY(_manager_perms)),
      (_org, 'employee', _perm, _perm = ANY(_employee_perms)),
      (_org, 'committee_member', _perm, _perm = ANY(_committee_perms))
    ON CONFLICT (organization_id, role, permission) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_org_role_permissions(uuid) TO authenticated, service_role;

INSERT INTO public.role_permissions (organization_id, role, permission, enabled)
SELECT o.id, 'program_manager'::public.app_role, p.permission, p.enabled
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('invite_staff', true),
    ('view_staff_records', true),
    ('edit_staff_records', true),
    ('view_staff_documents', true),
    ('upload_staff_documents', true),
    ('approve_staff_documents', true),
    ('view_clients', true),
    ('edit_client_records', true),
    ('manage_client_intake', true),
    ('view_client_medical', true),
    ('view_client_documents', true),
    ('manage_client_documents', true),
    ('manage_client_goals', true),
    ('view_schedule', true),
    ('create_shifts', true),
    ('edit_shifts', true),
    ('delete_shifts', true),
    ('approve_shift_swaps', true),
    ('manage_recurring_shifts', true),
    ('view_own_timesheets', true),
    ('view_team_timesheets', true),
    ('view_all_timesheets', true),
    ('approve_timesheets', true),
    ('edit_timesheets', true),
    ('export_evv', true),
    ('submit_shift_notes', true),
    ('edit_shift_notes', true),
    ('approve_shift_notes', true),
    ('view_daily_logs', true),
    ('submit_daily_logs', true),
    ('approve_daily_logs', true),
    ('submit_forms', true),
    ('view_form_submissions', true),
    ('approve_form_submissions', true),
    ('view_compliance_dashboard', true),
    ('complete_obligations', true),
    ('file_staff_documents', true),
    ('manage_obligations', true),
    ('report_incidents', true),
    ('view_incidents', true),
    ('manage_incidents', true),
    ('view_emar', true),
    ('submit_emar', true),
    ('view_hrc', true),
    ('manage_hrc', true),
    ('view_billing', true),
    ('view_payroll', true),
    ('view_analytics', true),
    ('export_reports', true)
) AS p(permission, enabled)
ON CONFLICT (organization_id, role, permission) DO NOTHING;

-- Fill remaining permission keys as disabled so the matrix is complete.
SELECT public.seed_org_role_permissions(id) FROM public.organizations;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_manager(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND role IN ('admin','program_manager','manager','super_admin')
      AND active
  );
$$;

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'program_manager', 'manager', 'employee'));
