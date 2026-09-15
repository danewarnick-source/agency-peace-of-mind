-- Isolated schema for agency-setup-gate integration tests.
-- Not production. Never run against Hive-Platform (dhrrukdcigiiqksibdfb).
-- This is a simplified stand-in — NOT the full project RLS/schema.
-- Full-project proof needs `supabase start` / db reset (see
-- scripts/agency-setup-gate-preview.md).

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hive_it_untrusted') THEN
    CREATE ROLE hive_it_untrusted NOINHERIT;
  END IF;
END
$$;

DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  services_offered text[],
  approx_client_count integer,
  specializations text,
  service_area text,
  fact_operates_ol_site boolean,
  fact_uses_volunteers boolean,
  fact_has_governing_board boolean,
  fact_provides_respite_overnight boolean,
  fact_is_usor_vendor boolean,
  fact_supports_self_administered_medication boolean,
  fact_acts_as_representative_payee boolean,
  fact_provides_transportation boolean,
  dhhs_provider_id text,
  sei_award_date date,
  fact_community_program_total_persons_served integer,
  fact_answers_updated_at timestamptz,
  fact_answers_updated_by uuid,
  setup_completed_at timestamptz,
  setup_completed_by uuid,
  setup_questionnaire_version integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL DEFAULT gen_random_uuid()::text,
  role text NOT NULL DEFAULT 'employee',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = auth.uid()
      AND om.active
  );
$$;

-- 2-arg overloads matching the production signature (is_org_member(_org,
-- _user), is_org_admin_or_manager(_org, _user)) — needed by the
-- compliance_fact_answers RLS policies added in the questionnaire migration.
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND om.active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_manager(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org
      AND om.user_id = p_user
      AND om.active
      AND om.role IN ('admin', 'program_manager', 'manager')
  );
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

-- Permissive org-scoped access. Setup gate adds RESTRICTIVE INSERT only.
DROP POLICY IF EXISTS organizations_member_select ON public.organizations;
CREATE POLICY organizations_member_select
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS organizations_member_update ON public.organizations;
CREATE POLICY organizations_member_update
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_member(id))
  WITH CHECK (public.is_org_member(id));

DROP POLICY IF EXISTS organizations_insert_any ON public.organizations;
CREATE POLICY organizations_insert_any
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS members_select_own_org ON public.organization_members;
CREATE POLICY members_select_own_org
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS members_insert_self_or_admin ON public.organization_members;
CREATE POLICY members_insert_self_or_admin
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS members_update_own_org ON public.organization_members;
CREATE POLICY members_update_own_org
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS clients_select_own_org ON public.clients;
CREATE POLICY clients_select_own_org
  ON public.clients FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS clients_insert_own_org ON public.clients;
CREATE POLICY clients_insert_own_org
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS clients_update_own_org ON public.clients;
CREATE POLICY clients_update_own_org
  ON public.clients FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS invitations_select_own_org ON public.invitations;
CREATE POLICY invitations_select_own_org
  ON public.invitations FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS invitations_insert_own_org ON public.invitations;
CREATE POLICY invitations_insert_own_org
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

-- So untrusted-role UPDATE reaches the fail-closed exempt trigger (FORCE RLS
-- would otherwise hide the row and skip the trigger). SELECT is required
-- for WHERE id = ...; pair it with a SELECT policy.
DROP POLICY IF EXISTS organizations_untrusted_select_for_lock_it ON public.organizations;
CREATE POLICY organizations_untrusted_select_for_lock_it
  ON public.organizations FOR SELECT TO anon, hive_it_untrusted
  USING (true);
DROP POLICY IF EXISTS organizations_untrusted_update_for_lock_it ON public.organizations;
CREATE POLICY organizations_untrusted_update_for_lock_it
  ON public.organizations FOR UPDATE TO anon, hive_it_untrusted
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Real Supabase projects configure this once at the project level, so
-- individual migrations never GRANT on their own new tables (see e.g.
-- 20260524055323, which creates pba_accounts with no GRANT at all). This
-- isolated schema does not have that project-level configuration, so any
-- migration applied after this file that CREATEs a new table (e.g. this
-- gate's own compliance_fact_answers) needs it replicated here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
