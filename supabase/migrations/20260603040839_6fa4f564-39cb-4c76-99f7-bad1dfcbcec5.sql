-- A1: Scope profiles "select own profile" to self; add safe-fields directory view for same-org members.

-- 1. Replace USING (true) with self-only
DROP POLICY IF EXISTS "select own profile" ON public.profiles;
CREATE POLICY "select own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- 2. SECURITY DEFINER view exposing only directory columns for same-org members.
--    security_invoker = false (default) → view executes as owner (postgres),
--    so RLS on public.profiles does not block it; access is gated by the WHERE
--    clause + the GRANT below.
DROP VIEW IF EXISTS public.org_member_directory;

CREATE VIEW public.org_member_directory
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.full_name,
  p.first_name,
  p.last_name,
  p.email,
  p.username,
  p.account_status,
  p.is_active,
  p.team_id,
  p.position
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.organization_members m_self
    JOIN public.organization_members m_other
      ON m_other.organization_id = m_self.organization_id
    WHERE m_self.user_id  = auth.uid()
      AND m_self.active   = true
      AND m_other.user_id = p.id
      AND m_other.active  = true
  );

REVOKE ALL ON public.org_member_directory FROM PUBLIC;
REVOKE ALL ON public.org_member_directory FROM anon;
GRANT SELECT ON public.org_member_directory TO authenticated;

COMMENT ON VIEW public.org_member_directory IS
  'Safe directory of same-organization members for authenticated users. '
  'Exposes only non-sensitive columns; sensitive comp/PII fields '
  '(hourly_rate, daily_rate, employee_id, hire_date, department, worker_type, '
  'evv_*) are intentionally omitted. WHERE clause restricts rows to profiles '
  'sharing an active organization with auth.uid().';