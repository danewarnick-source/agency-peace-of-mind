-- =============================================================
-- HIPAA / PHI security hardening (2026-08-25)
-- Critical + High: caseload RLS, clients_for_staff harden,
-- storage lockdown, PHI access audit, break-glass logging.
-- =============================================================

-- ── 1. Harden clients_for_staff ─────────────────────────────────────────────
-- Caller must be the staff themselves, an org admin/manager, or super_admin.
CREATE OR REPLACE FUNCTION public.clients_for_staff(_org uuid, _staff uuid)
RETURNS SETOF public.clients
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF auth.uid() IS DISTINCT FROM _staff
     AND NOT public.is_org_admin_or_manager(_org, auth.uid())
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cannot resolve another staff caseload';
  END IF;
  IF NOT public.is_org_member(_org, auth.uid())
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: not an org member';
  END IF;

  RETURN QUERY
  WITH direct AS (
    SELECT c.*
      FROM public.clients c
      JOIN public.staff_assignments sa
        ON sa.client_id = c.id
       AND sa.organization_id = c.organization_id
     WHERE sa.organization_id = _org
       AND sa.staff_id = _staff
  ),
  group_home_addrs AS (
    SELECT DISTINCT c.physical_address
      FROM public.clients c
      JOIN public.staff_assignments sa
        ON sa.client_id = c.id
       AND sa.organization_id = c.organization_id
     WHERE sa.organization_id = _org
       AND sa.staff_id = _staff
       AND sa.is_group_home_assignment = true
       AND c.physical_address IS NOT NULL
       AND length(btrim(c.physical_address)) > 0
  ),
  facility_mates AS (
    SELECT c.*
      FROM public.clients c
     WHERE c.organization_id = _org
       AND c.physical_address IN (SELECT physical_address FROM group_home_addrs)
  )
  SELECT * FROM direct
  UNION
  SELECT * FROM facility_mates;
END;
$$;

REVOKE ALL ON FUNCTION public.clients_for_staff(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clients_for_staff(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clients_for_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clients_for_staff(uuid, uuid) TO service_role;

-- ── 2. staff_assigned_to_client + can_access_client_phi ──────────────────────
CREATE OR REPLACE FUNCTION public.staff_assigned_to_client(_client_id uuid, _staff uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff_assignments sa
     WHERE sa.client_id = _client_id
       AND sa.staff_id = _staff
  )
  OR EXISTS (
    SELECT 1
      FROM public.clients target
      JOIN public.staff_assignments sa
        ON sa.staff_id = _staff
       AND sa.organization_id = target.organization_id
       AND sa.is_group_home_assignment = true
      JOIN public.clients assigned
        ON assigned.id = sa.client_id
       AND assigned.organization_id = target.organization_id
     WHERE target.id = _client_id
       AND assigned.physical_address IS NOT NULL
       AND length(btrim(assigned.physical_address)) > 0
       AND assigned.physical_address = target.physical_address
  );
$$;

REVOKE ALL ON FUNCTION public.staff_assigned_to_client(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_assigned_to_client(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_assigned_to_client(uuid, uuid) TO service_role;

-- Minimum-necessary PHI gate: admin/manager/HRC/super_admin OR caseload staff.
CREATE OR REPLACE FUNCTION public.can_access_client_phi(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin(auth.uid())
    OR public.is_hive_executive(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = _client_id
         AND (
           public.is_org_admin_or_manager(c.organization_id, auth.uid())
           OR public.is_hrc_committee_member(c.organization_id, auth.uid())
           OR (
             public.is_org_member(c.organization_id, auth.uid())
             AND public.staff_assigned_to_client(c.id, auth.uid())
           )
         )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_client_phi(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_client_phi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client_phi(uuid) TO service_role;

-- ── 3. Caseload-scoped SELECT on core PHI tables ────────────────────────────
DROP POLICY IF EXISTS "org members read clients" ON public.clients;
DROP POLICY IF EXISTS "members read clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view clients in their org" ON public.clients;

CREATE POLICY "caseload or admin read clients"
  ON public.clients FOR SELECT TO authenticated
  USING (public.can_access_client_phi(id));

DROP POLICY IF EXISTS "org members read meds" ON public.client_medications;
DROP POLICY IF EXISTS "members read client_medications" ON public.client_medications;
DROP POLICY IF EXISTS "org members read client medications" ON public.client_medications;
DROP POLICY IF EXISTS "members read meds" ON public.client_medications;

CREATE POLICY "caseload or admin read client_medications"
  ON public.client_medications FOR SELECT TO authenticated
  USING (public.can_access_client_phi(client_id));

DROP POLICY IF EXISTS "org members read emar" ON public.emar_logs;
DROP POLICY IF EXISTS "members read emar_logs" ON public.emar_logs;
DROP POLICY IF EXISTS "org members read emar logs" ON public.emar_logs;
DROP POLICY IF EXISTS "members read emar" ON public.emar_logs;

CREATE POLICY "caseload or admin read emar_logs"
  ON public.emar_logs FOR SELECT TO authenticated
  USING (public.can_access_client_phi(client_id));

DROP POLICY IF EXISTS "org members read timesheets" ON public.evv_timesheets;
DROP POLICY IF EXISTS "org members read evv_timesheets" ON public.evv_timesheets;
DROP POLICY IF EXISTS "members read timesheets" ON public.evv_timesheets;
DROP POLICY IF EXISTS "staff read own or managers read all evv" ON public.evv_timesheets;

CREATE POLICY "own staff, caseload, or admin read evv_timesheets"
  ON public.evv_timesheets FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.can_access_client_phi(client_id)
  );

-- client_documents (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'client_documents'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "org members read client documents" ON public.client_documents';
    EXECUTE 'DROP POLICY IF EXISTS "members read client_documents" ON public.client_documents';
    EXECUTE $p$
      CREATE POLICY "caseload or admin read client_documents"
        ON public.client_documents FOR SELECT TO authenticated
        USING (public.can_access_client_phi(client_id))
    $p$;
  END IF;
END $$;

-- ── 4. Storage: private client-photos + org-scoped incident/hrc ─────────────
UPDATE storage.buckets
   SET public = false
 WHERE id = 'client-photos';

-- Ensure buckets exist (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('hrc-documents', 'hrc-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop broad authenticated policies on incident-photos / hrc-documents
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND (
         policyname ILIKE '%incident-photos%'
         OR policyname ILIKE '%hrc-documents%'
         OR qual::text ILIKE '%incident-photos%'
         OR qual::text ILIKE '%hrc-documents%'
         OR with_check::text ILIKE '%incident-photos%'
         OR with_check::text ILIKE '%hrc-documents%'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Path layout: {organization_id}/...
CREATE POLICY "incident-photos org members select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'incident-photos'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
CREATE POLICY "incident-photos org members insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident-photos'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
CREATE POLICY "incident-photos admins update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'incident-photos'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );
CREATE POLICY "incident-photos admins delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'incident-photos'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "hrc-documents org members select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hrc-documents'
    AND (
      public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
      OR public.is_hrc_committee_member((storage.foldername(name))[1]::uuid, auth.uid())
    )
  );
CREATE POLICY "hrc-documents org members insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hrc-documents'
    AND (
      public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
      OR public.is_hrc_committee_member((storage.foldername(name))[1]::uuid, auth.uid())
    )
  );
CREATE POLICY "hrc-documents admins delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hrc-documents'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ── 5. PHI access audit log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.phi_access_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id    uuid NOT NULL,
  actor_role       text,
  resource_type    text NOT NULL,
  resource_id      uuid,
  client_id        uuid,
  action           text NOT NULL DEFAULT 'view',
  break_glass      boolean NOT NULL DEFAULT false,
  detail           text,
  ip               text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phi_access_org_created
  ON public.phi_access_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phi_access_client_created
  ON public.phi_access_audit_log (client_id, created_at DESC)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phi_access_break_glass
  ON public.phi_access_audit_log (organization_id, created_at DESC)
  WHERE break_glass = true;

GRANT SELECT ON public.phi_access_audit_log TO authenticated;
GRANT ALL ON public.phi_access_audit_log TO service_role;

ALTER TABLE public.phi_access_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read phi access audit" ON public.phi_access_audit_log;
CREATE POLICY "admins read phi access audit"
  ON public.phi_access_audit_log FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- Users cannot forge audit rows from the client; inserts go via service role.
DROP POLICY IF EXISTS "deny client insert phi access audit" ON public.phi_access_audit_log;
CREATE POLICY "deny client insert phi access audit"
  ON public.phi_access_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny client update phi access audit" ON public.phi_access_audit_log;
CREATE POLICY "deny client update phi access audit"
  ON public.phi_access_audit_log FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "deny client delete phi access audit" ON public.phi_access_audit_log;
CREATE POLICY "deny client delete phi access audit"
  ON public.phi_access_audit_log FOR DELETE TO authenticated
  USING (false);
