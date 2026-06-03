-- Tighten auditor_share_access_log INSERT policy to prevent forged actor identity / cross-org pollution.
DROP POLICY IF EXISTS "Authenticated insert share access log" ON public.auditor_share_access_log;

CREATE POLICY "Scoped insert share access log"
ON public.auditor_share_access_log
FOR INSERT
TO authenticated
WITH CHECK (
  -- Actor must be the calling user (cannot forge actor_user_id).
  actor_user_id = auth.uid()
  -- Actor email, if provided, must match the caller's verified JWT email.
  AND (
    actor_email IS NULL
    OR lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  -- share_id must belong to the stated organization_id (no cross-org log pollution).
  AND EXISTS (
    SELECT 1 FROM public.auditor_shares s
    WHERE s.id = auditor_share_access_log.share_id
      AND s.organization_id = auditor_share_access_log.organization_id
      AND (
        -- (a) Caller is an org admin/manager/super_admin for that org
        public.is_org_admin_or_manager(s.organization_id, auth.uid())
        -- (b) OR caller is the share recipient (by verified JWT email)
        OR lower(s.recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);