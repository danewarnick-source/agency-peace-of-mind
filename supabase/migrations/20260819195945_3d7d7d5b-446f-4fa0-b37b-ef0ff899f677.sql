-- user_permission_overrides
CREATE TABLE public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  granted_by uuid,
  granted_by_name text,
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, permission)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read overrides" ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'employee')
      OR public.has_org_role(organization_id, auth.uid(), 'manager')
      OR public.has_org_role(organization_id, auth.uid(), 'admin'));
CREATE POLICY "admins manage overrides" ON public.user_permission_overrides
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));

-- permission_audit_log
CREATE TABLE public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  changed_by_user_id uuid,
  changed_by_name text,
  change_type text NOT NULL,
  target_user_id uuid,
  target_user_name text,
  role text,
  permission text NOT NULL,
  previous_value boolean,
  new_value boolean,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read permission audit" ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'));

-- role_change_audit_log
CREATE TABLE public.role_change_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  changed_by_user_id uuid,
  changed_by_name text,
  target_user_id uuid,
  target_user_name text,
  previous_role text,
  new_role text,
  change_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.role_change_audit_log TO authenticated;
GRANT ALL ON public.role_change_audit_log TO service_role;
ALTER TABLE public.role_change_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read role audit" ON public.role_change_audit_log
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'));

-- scope_assignments
CREATE TABLE public.scope_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('all','client','service_code','staff_group')),
  scope_ref_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scope_assignments_org_user ON public.scope_assignments (organization_id, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_assignments TO authenticated;
GRANT ALL ON public.scope_assignments TO service_role;
ALTER TABLE public.scope_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read scopes" ON public.scope_assignments
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'employee')
      OR public.has_org_role(organization_id, auth.uid(), 'manager')
      OR public.has_org_role(organization_id, auth.uid(), 'admin'));
CREATE POLICY "admins manage scopes" ON public.scope_assignments
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'));

CREATE TRIGGER trg_upo_updated_at BEFORE UPDATE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_scope_updated_at BEFORE UPDATE ON public.scope_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- deactivation logger
CREATE OR REPLACE FUNCTION public.flag_member_deactivated(
  _org_id uuid, _user_id uuid, _changed_by_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.role_change_audit_log (
    organization_id, changed_by_user_id, changed_by_name,
    target_user_id, target_user_name, previous_role, new_role, change_method
  )
  SELECT _org_id, _changed_by_user_id,
         coalesce((SELECT full_name FROM public.org_member_directory WHERE id = _changed_by_user_id), 'Unknown'),
         _user_id,
         coalesce((SELECT full_name FROM public.org_member_directory WHERE id = _user_id), 'Unknown'),
         coalesce((SELECT role::text FROM public.organization_members WHERE organization_id = _org_id AND user_id = _user_id), 'unknown'),
         'deactivated',
         'flag_member_deactivated';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.flag_member_deactivated(uuid, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_member_deactivated(uuid, uuid, uuid) TO service_role;