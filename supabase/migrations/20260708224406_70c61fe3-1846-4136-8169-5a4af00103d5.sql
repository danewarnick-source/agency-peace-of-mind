
-- ============================================================================
-- MAR Pass 2 — Administration model foundation + billing-code hard-block
-- ============================================================================

-- 1) Extend emar_logs with administrator_role, credential_id, and allow the
--    'given' status distinct from 'self_administered'.
ALTER TABLE public.emar_logs
  ADD COLUMN IF NOT EXISTS administrator_role text,
  ADD COLUMN IF NOT EXISTS credential_id uuid;

-- Enforce allowed roles (nullable = legacy row, treated as 'self' semantics
-- by app code for read-back). All NEW writes must set it.
ALTER TABLE public.emar_logs
  DROP CONSTRAINT IF EXISTS emar_logs_administrator_role_ck;
ALTER TABLE public.emar_logs
  ADD CONSTRAINT emar_logs_administrator_role_ck
  CHECK (administrator_role IS NULL OR administrator_role IN
    ('self','staff_observed','staff_administered','lpn','rn','delegated'));

-- Expand allowed status values to include 'given' (hands-on administration)
-- alongside the existing 'self_administered' path. Keep all legacy values
-- accepted so the merged shift/eMAR read is loss-free.
ALTER TABLE public.emar_logs
  DROP CONSTRAINT IF EXISTS emar_logs_status_ck;
ALTER TABLE public.emar_logs
  ADD CONSTRAINT emar_logs_status_ck
  CHECK (status IN
    ('self_administered','given','refused','omitted','missed','held','administered'));

-- credential_id is soft-linked; we do not FK it because it may reference
-- either certifications or external_certifications, resolved by role.
CREATE INDEX IF NOT EXISTS emar_logs_administrator_role_idx
  ON public.emar_logs (administrator_role);

-- 2) Promote client_medications.support_level to a controlled vocabulary
--    matching the administrator_role value set. Add a needs-review flag for
--    ambiguous back-fills so admins can reconcile without data loss.
ALTER TABLE public.client_medications
  ADD COLUMN IF NOT EXISTS support_level_needs_review boolean NOT NULL DEFAULT false;

-- Back-fill legacy free-text values:
--   reminder    -> staff_observed  (reminder ≈ prompt + observe self-admin)
--   full_assist -> NULL + flag     (ambiguous: could be staff_administered
--                                   or lpn/rn — needs admin to resolve)
--   NULL        -> NULL            (unset, no assumption)
UPDATE public.client_medications
   SET support_level = 'staff_observed'
 WHERE support_level = 'reminder';

UPDATE public.client_medications
   SET support_level = NULL,
       support_level_needs_review = true
 WHERE support_level = 'full_assist';

ALTER TABLE public.client_medications
  DROP CONSTRAINT IF EXISTS client_medications_support_level_ck;
ALTER TABLE public.client_medications
  ADD CONSTRAINT client_medications_support_level_ck
  CHECK (support_level IS NULL OR support_level IN
    ('self','staff_observed','staff_administered','lpn','rn','delegated'));

-- 3) LPN / RN credential types (used by external_certifications.cert_type).
INSERT INTO public.certification_types (code, name)
VALUES
  ('lpn', 'Licensed Practical Nurse (LPN)'),
  ('rn',  'Registered Nurse (RN)')
ON CONFLICT (code) DO NOTHING;

-- 4) Helper: does the client currently have an active PM/PN medication
--    administration billing code? (Any of PM1/PM2/PN1/PN2 with an open
--    authorization window.)
CREATE OR REPLACE FUNCTION public.client_has_med_admin_code(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.client_billing_codes cbc
     WHERE cbc.client_id = _client_id
       AND upper(cbc.service_code) IN ('PM1','PM2','PN1','PN2')
       AND (cbc.service_end_date IS NULL OR cbc.service_end_date > CURRENT_DATE)
  );
$$;

-- 5) Helper: does this user hold an active, approved credential of the
--    given kind (lpn|rn) in this org? Reads external_certifications, which
--    is where scanned professional licenses live.
CREATE OR REPLACE FUNCTION public.user_has_active_credential(
  _user_id uuid,
  _org_id uuid,
  _cert_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.external_certifications ec
     WHERE ec.user_id = _user_id
       AND ec.organization_id = _org_id
       AND lower(ec.cert_type) = lower(_cert_type)
       AND coalesce(ec.status,'approved') = 'approved'
       AND (ec.expires_at IS NULL OR ec.expires_at > now())
  );
$$;

-- 6) Server-authoritative gate: is this administrator_role permitted for
--    this client right now? Used by logMedicationPass and any future
--    trigger. Encapsulates the compliance rule so the mapping updates in
--    one place if the SOW authoritative-sources engine later drives it.
CREATE OR REPLACE FUNCTION public.med_admin_role_permitted(
  _client_id uuid,
  _org_id uuid,
  _user_id uuid,
  _role text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_code boolean;
BEGIN
  -- 'self' and 'staff_observed' are always permitted; they are observation-
  -- only paths and do not require a PM/PN authorization.
  IF _role IN ('self','staff_observed') THEN
    RETURN true;
  END IF;

  -- Hands-on paths REQUIRE a PM/PN authorization on the client.
  has_code := public.client_has_med_admin_code(_client_id);
  IF NOT has_code THEN
    RETURN false;
  END IF;

  -- Credential gate for licensed paths.
  IF _role = 'lpn' THEN
    RETURN public.user_has_active_credential(_user_id, _org_id, 'lpn')
        OR public.user_has_active_credential(_user_id, _org_id, 'rn'); -- RN can act as LPN scope
  ELSIF _role = 'rn' THEN
    RETURN public.user_has_active_credential(_user_id, _org_id, 'rn');
  ELSIF _role = 'delegated' THEN
    -- Delegation record TBD in a later pass; for now require an LPN or RN
    -- credential on file OR an explicit delegation flag we don't yet track.
    -- Conservative default: block until delegation record exists.
    RETURN false;
  ELSIF _role = 'staff_administered' THEN
    -- Unlicensed hands-on administration is permitted only where the client
    -- has PM/PN authorization AND agency policy permits DSP administration.
    -- Baseline: allow when PM/PN exists (satisfied above). Delegation
    -- specifics tightened in a later pass.
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_has_med_admin_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_active_credential(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.med_admin_role_permitted(uuid, uuid, uuid, text) TO authenticated, service_role;
