REVOKE EXECUTE ON FUNCTION public.clients_for_staff(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clients_for_staff(uuid, uuid) TO authenticated;