-- Fresh paid orgs (Salt Lake Care Co / pi20 and 12 others on live) have
-- organization_members.role = admin but zero role_permissions rows.
--
-- Cause: seed_role_permissions_after_org_insert was never applied on
-- Hive-Platform. The dead rbac_roles trigger was dropped (20260903) and
-- the only remaining organizations trigger is service-code seed.
-- usePermissions().can() then returns false for view_clients /
-- view_staff_records → RequirePermission → /unauthorized (Access denied).
--
-- This file is also copied into docs/SQL_HANDOFF.md. Do not apply from CI.
-- Counts and ids only — no emails, names, or phones.

-- 1) Recreate the new-org seed trigger (calls existing seed_org_role_permissions)
CREATE OR REPLACE FUNCTION public.trg_seed_role_permissions_on_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_org_role_permissions(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_role_permissions_after_org_insert ON public.organizations;
CREATE TRIGGER seed_role_permissions_after_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seed_role_permissions_on_new_org();

-- 2) has_permission fallback must match src/lib/rbac.ts DEFAULT_MATRIX.
-- Live fallback only listed legacy keys — not view_clients / view_staff_records.
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
  IF to_regclass('public.user_permission_overrides') IS NOT NULL THEN
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
  END IF;

  SELECT role INTO _role
  FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _org_id AND active
  LIMIT 1;

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  SELECT enabled INTO _override
  FROM public.role_permissions
  WHERE organization_id = _org_id
    AND role = _role
    AND permission = _perm
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(_override, false);
  END IF;

  -- Unseeded org / missing pair: DEFAULT_MATRIX. Owner has every key.
  IF _role = 'admin'::app_role THEN
    RETURN true;
  END IF;

  RETURN CASE
    WHEN _role = 'program_manager'::app_role AND _perm IN (
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
    ) THEN true
    WHEN _role = 'manager'::app_role AND _perm IN (
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
    ) THEN true
    WHEN _role = 'employee'::app_role AND _perm IN (
      'view_own_timesheets','submit_shift_notes','submit_daily_logs',
      'submit_forms','complete_obligations',
      'report_incidents','view_emar','submit_emar',
      'view_own_training','view_certifications','upload_external_certs'
    ) THEN true
    WHEN _role = 'committee_member'::app_role AND _perm IN (
      'view_hrc','manage_hrc'
    ) THEN true
    ELSE false
  END;
END;
$$;

-- 3) Backfill orgs with zero role_permissions rows (idempotent).
SELECT public.seed_org_role_permissions(o.id)
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.organization_id = o.id
);

-- Confirm (no PHI): trigger present + unseeded count + pi20 add-client/staff keys.
SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.organizations'::regclass
      AND tgname = 'seed_role_permissions_after_org_insert'
  ) AS seed_trigger_on,
  (
    SELECT count(*) FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp WHERE rp.organization_id = o.id
    )
  ) AS orgs_still_unseeded,
  (
    SELECT count(*) FROM public.role_permissions rp
    JOIN public.organizations o ON o.id = rp.organization_id
    WHERE o.slug = 'danewarnick-pi20-s-workspace-567872'
      AND rp.role = 'admin'
      AND rp.permission IN ('view_clients', 'view_staff_records')
      AND rp.enabled
  ) AS pi20_admin_add_perms;
