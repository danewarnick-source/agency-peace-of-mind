
-- 1) Certifications: stop public table-wide reads; expose verification via SECURITY DEFINER RPC
DROP POLICY IF EXISTS "public verify cert" ON public.certifications;

CREATE POLICY "users read own certs"
  ON public.certifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.verify_certification(_code text)
RETURNS TABLE (
  verification_code text,
  recipient_name text,
  course_title text,
  issued_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.verification_code, c.recipient_name, c.course_title, c.issued_at, c.expires_at
  FROM public.certifications c
  WHERE c.verification_code = _code
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_certification(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certification(text) TO anon, authenticated;

-- 2) staff_certifications: lock down to super_admin only (table is demo/seed; not referenced by app)
DROP POLICY IF EXISTS "auth can read certs" ON public.staff_certifications;
CREATE POLICY "super admins read staff certs"
  ON public.staff_certifications FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 3) organization_members: remove open self-insert. Joining an org must go through accept_invitation().
DROP POLICY IF EXISTS "self insert member" ON public.organization_members;

-- 4) training-assets storage bucket: restrict writes to org admins/managers; remove broad listing policy
DROP POLICY IF EXISTS "managers upload training assets" ON storage.objects;
DROP POLICY IF EXISTS "managers update training assets" ON storage.objects;
DROP POLICY IF EXISTS "managers delete training assets" ON storage.objects;
DROP POLICY IF EXISTS "public read training assets" ON storage.objects;

-- Public bucket: files remain accessible via /object/public/ (which bypasses RLS).
-- We do not add a broad SELECT policy on storage.objects so the bucket cannot be listed.

CREATE POLICY "org managers upload training assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'training-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','manager','super_admin')
    )
  );

CREATE POLICY "org managers update training assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'training-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','manager','super_admin')
    )
  );

CREATE POLICY "org managers delete training assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'training-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','manager','super_admin')
    )
  );

-- 5) Lock down SECURITY DEFINER helper functions that should not be callable from PostgREST.
-- Keep RPC access for the functions actually invoked from the client: accept_invitation,
-- notify_medication_error, generate_pba_audit_sample, clients_for_staff, hybrid_search_timesheets,
-- verify_certification.
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_admin_or_manager(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_org_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_assignment_progress() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_certificate_on_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_incident_filed(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_timesheets(vector, integer, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon, authenticated;

-- 6) Fix mutable search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$$;
