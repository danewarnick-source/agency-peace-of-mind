CREATE OR REPLACE FUNCTION public.restore_my_admin_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_members
  SET role = 'super_admin', active = true
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_my_admin_role() TO authenticated;