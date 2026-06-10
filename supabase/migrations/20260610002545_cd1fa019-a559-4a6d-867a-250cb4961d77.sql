CREATE OR REPLACE FUNCTION public.restore_my_admin_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'restore_my_admin_role is permanently disabled';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_my_admin_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_my_admin_role() FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_my_admin_role() FROM authenticated;