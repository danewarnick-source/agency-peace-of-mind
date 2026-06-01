CREATE OR REPLACE FUNCTION public.is_org_admin_or_manager(_org uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND role IN ('admin','manager','super_admin')
      AND active
  );
$function$;