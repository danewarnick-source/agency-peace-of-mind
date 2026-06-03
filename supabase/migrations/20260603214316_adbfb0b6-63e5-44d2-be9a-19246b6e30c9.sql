-- 1. PII columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ssn_last4 char(4),
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS home_address text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_ssn_last4_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_ssn_last4_chk CHECK (ssn_last4 IS NULL OR ssn_last4 ~ '^[0-9]{4}$');

-- 2. Tighten pay + new PII column reads (fail-closed; only the gated fn returns them)
REVOKE SELECT (hourly_rate, daily_rate, ssn_last4, date_of_birth, home_address)
  ON public.profiles FROM authenticated;
REVOKE SELECT (hourly_rate, daily_rate, ssn_last4, date_of_birth, home_address)
  ON public.profiles FROM anon;

-- Allow updates to PII only via authenticated; gating handled in server fn
GRANT UPDATE (hourly_rate, daily_rate, ssn_last4, date_of_birth, home_address)
  ON public.profiles TO authenticated;

-- 3. Gate function: admin OR team-manager-of-staff OR self
CREATE OR REPLACE FUNCTION public.can_view_staff_pii(_org uuid, _staff uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _viewer = _staff
    OR public.has_org_role(_org, _viewer, 'admin'::app_role)
    OR public.has_org_role(_org, _viewer, 'super_admin'::app_role)
    OR public.is_hive_executive(_viewer)
    OR EXISTS (
      SELECT 1
        FROM public.profiles p
        JOIN public.teams t ON t.id = p.team_id
       WHERE p.id = _staff
         AND t.organization_id = _org
         AND t.manager_id = _viewer
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_staff_pii(uuid, uuid, uuid) TO authenticated;

-- 4. Read PII for one staffer (returns no rows if not authorized — fail closed)
CREATE OR REPLACE FUNCTION public.get_staff_pii(_org uuid, _staff uuid)
RETURNS TABLE(
  staff_id uuid,
  ssn_last4 char(4),
  date_of_birth date,
  home_address text,
  hourly_rate numeric,
  daily_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.ssn_last4, p.date_of_birth, p.home_address, p.hourly_rate, p.daily_rate
  FROM public.profiles p
  WHERE p.id = _staff
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = _org AND om.user_id = _staff AND om.active
    )
    AND public.can_view_staff_pii(_org, _staff, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_pii(uuid, uuid) TO authenticated;

-- 5. List staff PII authorized to caller (omits rows the caller can't see)
CREATE OR REPLACE FUNCTION public.list_staff_pii(_org uuid)
RETURNS TABLE(
  staff_id uuid,
  ssn_last4 char(4),
  date_of_birth date,
  home_address text,
  hourly_rate numeric,
  daily_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.ssn_last4, p.date_of_birth, p.home_address, p.hourly_rate, p.daily_rate
  FROM public.profiles p
  JOIN public.organization_members om
    ON om.user_id = p.id AND om.organization_id = _org AND om.active
  WHERE public.can_view_staff_pii(_org, p.id, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.list_staff_pii(uuid) TO authenticated;

-- 6. Per-staff checklist completion
CREATE TABLE IF NOT EXISTS public.staff_checklist_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','complete','expired','waived')),
  completed_date date,
  expires_at date,
  evidence_document_id uuid,
  notes text,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_scc_org_staff ON public.staff_checklist_completion(organization_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_scc_requirement ON public.staff_checklist_completion(requirement_id);
CREATE INDEX IF NOT EXISTS idx_scc_expires ON public.staff_checklist_completion(expires_at) WHERE expires_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_checklist_completion TO authenticated;
GRANT ALL ON public.staff_checklist_completion TO service_role;

ALTER TABLE public.staff_checklist_completion ENABLE ROW LEVEL SECURITY;

-- Read: same gate as PII (admin / team manager / self)
CREATE POLICY "scc read gated"
ON public.staff_checklist_completion FOR SELECT TO authenticated
USING (public.can_view_staff_pii(organization_id, staff_id, auth.uid()));

-- Write/update/delete: admin or team manager of staff (NOT self — self can't edit own completion)
CREATE POLICY "scc write admin or team manager"
ON public.staff_checklist_completion FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() <> staff_id
  AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
);

CREATE POLICY "scc update admin or team manager"
ON public.staff_checklist_completion FOR UPDATE TO authenticated
USING (
  auth.uid() <> staff_id
  AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
);

CREATE POLICY "scc delete admin or team manager"
ON public.staff_checklist_completion FOR DELETE TO authenticated
USING (
  auth.uid() <> staff_id
  AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
);

CREATE TRIGGER trg_scc_updated_at BEFORE UPDATE ON public.staff_checklist_completion
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. HR documents (pointers; bytes live in storage)
CREATE TABLE IF NOT EXISTS public.hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.nectar_requirements(id) ON DELETE SET NULL,
  document_kind text NOT NULL,
  object_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_docs_staff ON public.hr_documents(organization_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_docs_requirement ON public.hr_documents(requirement_id);

GRANT SELECT, INSERT, DELETE ON public.hr_documents TO authenticated;
GRANT ALL ON public.hr_documents TO service_role;

ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_docs read gated"
ON public.hr_documents FOR SELECT TO authenticated
USING (public.can_view_staff_pii(organization_id, staff_id, auth.uid()));

CREATE POLICY "hr_docs insert gated"
ON public.hr_documents FOR INSERT TO authenticated
WITH CHECK (public.can_view_staff_pii(organization_id, staff_id, auth.uid()));

CREATE POLICY "hr_docs delete admin or manager"
ON public.hr_documents FOR DELETE TO authenticated
USING (
  auth.uid() <> staff_id
  AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
);

ALTER TABLE public.staff_checklist_completion
  ADD CONSTRAINT scc_evidence_fk
  FOREIGN KEY (evidence_document_id) REFERENCES public.hr_documents(id) ON DELETE SET NULL;

-- 8. Append-only access log
CREATE TABLE IF NOT EXISTS public.hr_document_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hr_document_id uuid REFERENCES public.hr_documents(id) ON DELETE SET NULL,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('view_url_issued','upload','delete')),
  object_path text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hrdal_staff ON public.hr_document_access_log(organization_id, staff_id, at DESC);

GRANT SELECT, INSERT ON public.hr_document_access_log TO authenticated;
GRANT ALL ON public.hr_document_access_log TO service_role;

ALTER TABLE public.hr_document_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hrdal read admin only"
ON public.hr_document_access_log FOR SELECT TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
  OR public.is_hive_executive(auth.uid())
);

CREATE POLICY "hrdal insert by authed (server-fn writes own viewer_id)"
ON public.hr_document_access_log FOR INSERT TO authenticated
WITH CHECK (viewer_id = auth.uid());

-- Append-only: block UPDATE/DELETE via trigger
CREATE OR REPLACE FUNCTION public.hr_document_access_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'hr_document_access_log is append-only.'; END; $$;

CREATE TRIGGER trg_hrdal_no_update BEFORE UPDATE ON public.hr_document_access_log
FOR EACH ROW EXECUTE FUNCTION public.hr_document_access_log_immutable();

CREATE TRIGGER trg_hrdal_no_delete BEFORE DELETE ON public.hr_document_access_log
FOR EACH ROW EXECUTE FUNCTION public.hr_document_access_log_immutable();

-- 9. Live base checklist read helper (for the per-staff UI)
CREATE OR REPLACE FUNCTION public.get_hr_staff_checklist_base(_org uuid)
RETURNS SETOF public.nectar_requirements
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.*
  FROM public.nectar_requirements r
  WHERE r.organization_id = _org
    AND r.metadata->>'scope' = 'hr_staff_checklist'
    AND r.approval_state = 'provider_confirmed'
    AND public.is_org_member(_org, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_hr_staff_checklist_base(uuid) TO authenticated;