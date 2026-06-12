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
BEGIN
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

  -- Explicit per-org override wins
  SELECT enabled INTO _override
  FROM public.role_permissions
  WHERE organization_id = _org_id
    AND role = _role
    AND permission = _perm
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(_override, false);
  END IF;

  -- Fallback: replicate DEFAULT_MATRIX from src/lib/rbac.ts
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