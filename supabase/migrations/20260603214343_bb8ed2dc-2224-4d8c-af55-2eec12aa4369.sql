REVOKE EXECUTE ON FUNCTION public.can_view_staff_pii(uuid,uuid,uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_pii(uuid,uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.list_staff_pii(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_hr_staff_checklist_base(uuid) FROM public, anon;