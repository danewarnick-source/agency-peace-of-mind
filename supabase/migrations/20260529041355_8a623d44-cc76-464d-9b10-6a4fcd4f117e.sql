GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin_or_manager(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_admin_role() TO authenticated;