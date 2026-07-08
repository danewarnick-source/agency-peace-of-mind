-- ============================================================
-- RBAC pass 1: layered capability model + fail-closed resolver
-- ============================================================

-- 1) Custom roles per org (baseline capability sets)
CREATE TABLE public.rbac_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  capabilities text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_roles TO authenticated;
GRANT ALL ON public.rbac_roles TO service_role;

ALTER TABLE public.rbac_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read rbac_roles" ON public.rbac_roles
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Only admins can create/edit CUSTOM roles. System roles are immutable
-- to org admins (only super_admin/the seed function may touch them).
CREATE POLICY "admins manage custom rbac_roles" ON public.rbac_roles
  FOR ALL TO authenticated
  USING (
    is_system = false
    AND (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    is_system = false
    AND (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "super admin manages system rbac_roles" ON public.rbac_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2) Per-user capability overrides (the layer)
CREATE TABLE public.user_capability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('grant','deny')),
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, capability_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_capability_overrides TO authenticated;
GRANT ALL ON public.user_capability_overrides TO service_role;

ALTER TABLE public.user_capability_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage user_capability_overrides" ON public.user_capability_overrides
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
              OR public.is_super_admin(auth.uid()));

-- Users may read their own overrides so the client can build effective caps
-- without an admin round trip; managers can read team members' overrides.
CREATE POLICY "users read own user_capability_overrides" ON public.user_capability_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.is_org_admin_or_manager(organization_id, auth.uid()));

-- 3) Membership → custom role pointer (nullable; NULL falls back to
--    the seeded system role that matches the legacy app_role enum)
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS custom_role_id uuid
    REFERENCES public.rbac_roles(id) ON DELETE SET NULL;

-- 4) System-role seeder — reruns are idempotent, only touches is_system rows
CREATE OR REPLACE FUNCTION public.seed_system_rbac_roles(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rbac_roles (organization_id, name, is_system, description, capabilities)
  VALUES
    (_org, 'Admin', true,
      'Full access to the organization.',
      ARRAY[
        -- section access
        'section.clients','section.employees','section.scheduler',
        'section.finances','section.reports','section.documentation',
        'section.settings','section.exec',
        -- sensitive-data flags
        'data.financials','data.phi','data.pba','billing.manage',
        -- view/manage pairs
        'clients.view','clients.manage',
        'employees.view','employees.manage',
        'scheduler.view','scheduler.manage',
        'reports.view','reports.manage',
        'documentation.view','documentation.manage',
        'settings.manage'
      ]),
    (_org, 'Manager', true,
      'Manages people, schedule, and day-to-day operations. Financial access is opt-in per user.',
      ARRAY[
        'section.clients','section.employees','section.scheduler',
        'section.reports','section.documentation',
        -- NOTE: no data.financials, no data.pba by default (opt-in via override)
        'data.phi',
        'clients.view','clients.manage',
        'employees.view','employees.manage',
        'scheduler.view','scheduler.manage',
        'reports.view',
        'documentation.view','documentation.manage'
      ]),
    (_org, 'Employee', true,
      'Their own profile, assigned clients, and schedule view.',
      ARRAY[
        'section.clients','section.scheduler','section.documentation',
        'clients.view','scheduler.view','documentation.view'
      ])
  ON CONFLICT (organization_id, name) DO UPDATE
    SET capabilities = EXCLUDED.capabilities,
        description  = EXCLUDED.description,
        updated_at   = now()
    WHERE public.rbac_roles.is_system = true;
END;
$$;

-- Backfill existing orgs
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_system_rbac_roles(o.id);
  END LOOP;
END $$;

-- Auto-seed on new orgs
CREATE OR REPLACE FUNCTION public.trg_seed_rbac_on_new_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.seed_system_rbac_roles(NEW.id); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS seed_rbac_after_org_insert ON public.organizations;
CREATE TRIGGER seed_rbac_after_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_rbac_on_new_org();

-- 5) The resolver — fail closed, deny wins (even over super_admin)
CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _org_id uuid, _cap text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member record;
  _role_name text;
  _has_base boolean := false;
  _override text;
BEGIN
  IF _user_id IS NULL OR _org_id IS NULL OR _cap IS NULL OR _cap = '' THEN
    RETURN false;
  END IF;

  -- Explicit deny wins over everything, including super_admin
  SELECT mode INTO _override
  FROM public.user_capability_overrides
  WHERE user_id = _user_id AND organization_id = _org_id AND capability_key = _cap
  LIMIT 1;

  IF _override = 'deny' THEN
    RETURN false;
  END IF;

  -- Super admin bypass (after deny check)
  IF public.is_super_admin(_user_id) THEN
    RETURN true;
  END IF;

  -- Explicit grant adds even without a matching baseline
  IF _override = 'grant' THEN
    RETURN true;
  END IF;

  -- Baseline from custom_role_id if set, else seeded system role matching app_role
  SELECT om.role::text AS role, om.custom_role_id
    INTO _member
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND om.active = true
  LIMIT 1;

  IF _member IS NULL THEN
    RETURN false;
  END IF;

  IF _member.custom_role_id IS NOT NULL THEN
    SELECT _cap = ANY(capabilities) INTO _has_base
    FROM public.rbac_roles WHERE id = _member.custom_role_id;
  ELSE
    _role_name := CASE _member.role
      WHEN 'admin'       THEN 'Admin'
      WHEN 'super_admin' THEN 'Admin'
      WHEN 'manager'     THEN 'Manager'
      WHEN 'employee'    THEN 'Employee'
      ELSE NULL
    END;
    IF _role_name IS NOT NULL THEN
      SELECT _cap = ANY(capabilities) INTO _has_base
      FROM public.rbac_roles
      WHERE organization_id = _org_id AND name = _role_name AND is_system = true
      LIMIT 1;
    END IF;
  END IF;

  RETURN COALESCE(_has_base, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_capability(uuid, uuid, text)
  TO authenticated, service_role;

-- 6) Full effective set for a user (client hook + admin UIs consume this)
CREATE OR REPLACE FUNCTION public.effective_capabilities(_user_id uuid, _org_id uuid)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member record;
  _role_name text;
  _base text[] := ARRAY[]::text[];
BEGIN
  IF _user_id IS NULL OR _org_id IS NULL THEN RETURN; END IF;

  SELECT om.role::text AS role, om.custom_role_id
    INTO _member
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND om.active = true
  LIMIT 1;

  IF _member IS NOT NULL THEN
    IF _member.custom_role_id IS NOT NULL THEN
      SELECT capabilities INTO _base FROM public.rbac_roles WHERE id = _member.custom_role_id;
    ELSE
      _role_name := CASE _member.role
        WHEN 'admin'       THEN 'Admin'
        WHEN 'super_admin' THEN 'Admin'
        WHEN 'manager'     THEN 'Manager'
        WHEN 'employee'    THEN 'Employee'
        ELSE NULL END;
      IF _role_name IS NOT NULL THEN
        SELECT capabilities INTO _base
        FROM public.rbac_roles
        WHERE organization_id = _org_id AND name = _role_name AND is_system = true
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (SELECT unnest(COALESCE(_base, ARRAY[]::text[])) AS cap),
       grants AS (
         SELECT capability_key AS cap FROM public.user_capability_overrides
         WHERE user_id = _user_id AND organization_id = _org_id AND mode = 'grant'
       ),
       denies AS (
         SELECT capability_key AS cap FROM public.user_capability_overrides
         WHERE user_id = _user_id AND organization_id = _org_id AND mode = 'deny'
       )
  SELECT DISTINCT m.cap
  FROM (SELECT cap FROM base UNION SELECT cap FROM grants) m
  WHERE m.cap NOT IN (SELECT cap FROM denies);
END;
$$;

GRANT EXECUTE ON FUNCTION public.effective_capabilities(uuid, uuid)
  TO authenticated, service_role;

-- 7) updated_at touch trigger for both new tables
CREATE OR REPLACE FUNCTION public._rbac_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER rbac_roles_touch
  BEFORE UPDATE ON public.rbac_roles
  FOR EACH ROW EXECUTE FUNCTION public._rbac_touch_updated_at();

CREATE TRIGGER user_capability_overrides_touch
  BEFORE UPDATE ON public.user_capability_overrides
  FOR EACH ROW EXECUTE FUNCTION public._rbac_touch_updated_at();

-- Helpful indexes
CREATE INDEX idx_rbac_roles_org ON public.rbac_roles(organization_id);
CREATE INDEX idx_uco_user_org ON public.user_capability_overrides(user_id, organization_id);
CREATE INDEX idx_uco_org_cap ON public.user_capability_overrides(organization_id, capability_key);
CREATE INDEX idx_org_members_custom_role ON public.organization_members(custom_role_id)
  WHERE custom_role_id IS NOT NULL;