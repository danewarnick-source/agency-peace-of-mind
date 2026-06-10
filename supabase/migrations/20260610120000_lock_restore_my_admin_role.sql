-- SECURITY FIX — lock down restore_my_admin_role()
--
-- The function public.restore_my_admin_role() was created SECURITY DEFINER with
--   UPDATE public.organization_members SET role = 'super_admin', active = true
--   WHERE user_id = auth.uid();
-- and was GRANT EXECUTE ... TO authenticated. That let ANY authenticated user
-- call it (directly via the public anon key + their session, e.g. the /fix-admin
-- page or a one-line supabase.rpc call) and self-promote to super_admin. Because
-- RLS policies across the app use `OR is_super_admin(auth.uid())` (not scoped to a
-- single org), one active super_admin membership grants cross-organization read
-- access to every tenant's PHI. This is a privilege-escalation hole.
--
-- This self-service "restore my own admin role" has no safe production purpose, so
-- we DISABLE it: the function now rejects every caller, and EXECUTE is revoked from
-- all client roles. (If a deliberate, properly-guarded break-glass is ever needed,
-- implement it separately with a server-side secret / service-role check.)

CREATE OR REPLACE FUNCTION public.restore_my_admin_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'restore_my_admin_role is disabled: self-service admin elevation is not permitted';
END;
$$;

-- Remove the grants that made it callable by clients. Done AFTER the replace so the
-- revokes apply to the current function object; PUBLIC is revoked to cover Postgres'
-- default EXECUTE-to-PUBLIC grant as well.
REVOKE EXECUTE ON FUNCTION public.restore_my_admin_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_my_admin_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_my_admin_role() FROM authenticated;
