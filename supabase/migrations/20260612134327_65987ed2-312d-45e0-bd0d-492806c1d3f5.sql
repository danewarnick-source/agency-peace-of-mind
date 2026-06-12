
-- 1) Provider Interest Outline (one per org for v1; named for forward-compat)
CREATE TABLE public.provider_interest_outline (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  location_mode text NOT NULL DEFAULT 'anywhere' CHECK (location_mode IN ('anywhere','county','city')),
  location_values text[] NOT NULL DEFAULT '{}',
  codes_held text[] NOT NULL DEFAULT '{}',
  need_levels_served text[] NOT NULL DEFAULT '{}',
  disability_types_served text[] NOT NULL DEFAULT '{}',
  disability_levels_served text[] NOT NULL DEFAULT '{}',
  match_weights jsonb NOT NULL DEFAULT jsonb_build_object(
    'location', 0.25,
    'code_overlap', 0.25,
    'disability_fit', 0.20,
    'need_fit', 0.15,
    'host_fit', 0.15
  ),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_interest_outline TO authenticated;
GRANT ALL ON public.provider_interest_outline TO service_role;

ALTER TABLE public.provider_interest_outline ENABLE ROW LEVEL SECURITY;

-- Read: anyone in org with view_referrals OR manage_referrals
CREATE POLICY "outline_read" ON public.provider_interest_outline
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      public.has_permission(auth.uid(), organization_id, 'view_referrals')
      OR public.has_permission(auth.uid(), organization_id, 'manage_referrals')
    )
  );

-- Write: manage_referrals only
CREATE POLICY "outline_write" ON public.provider_interest_outline
  FOR ALL TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND public.has_permission(auth.uid(), organization_id, 'manage_referrals')
  )
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.has_permission(auth.uid(), organization_id, 'manage_referrals')
  );

CREATE TRIGGER provider_interest_outline_touch
  BEFORE UPDATE ON public.provider_interest_outline
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Extend has_permission defaults to include referral perms + super_admin bypass
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _org_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _override boolean;
BEGIN
  SELECT role INTO _role
  FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1;

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  -- super_admin bypass
  IF _role = 'super_admin'::app_role THEN
    RETURN true;
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

  RETURN CASE
    WHEN _role = 'admin'::app_role AND _perm IN (
      'manage_users','invite_users','remove_users','manage_roles',
      'assign_training','create_courses','edit_courses','manage_certifications',
      'manage_programs','approve_external_certs','upload_external_certs',
      'export_reports','view_analytics','view_team_reports',
      'manage_billing','view_billing','manage_organization',
      'view_own_training','view_certifications',
      'view_financial_monthly_grid','view_financial_host_home',
      'view_financial_contractors','view_financial_totals','view_financial_tns_gross',
      'view_financial_rhs','view_financial_employees',
      'view_referrals','manage_referrals'
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
$function$;
