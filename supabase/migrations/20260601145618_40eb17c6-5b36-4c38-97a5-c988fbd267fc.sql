-- Restrict reads on client_billing_codes to admin/manager/super_admin only.
-- Staff must never see rate_per_unit, annual_unit_authorization, or any dollar fields.
DROP POLICY IF EXISTS "Org members can read client billing codes" ON public.client_billing_codes;

CREATE POLICY "Admins read client billing codes"
ON public.client_billing_codes
FOR SELECT
TO authenticated
USING (
  is_org_admin_or_manager(organization_id, auth.uid())
  OR is_super_admin(auth.uid())
);

-- Money-free caps view: exposes ONLY time/unit cap fields so staff can render
-- utilization bars without ever seeing billing rates or dollar authorizations.
CREATE OR REPLACE FUNCTION public.get_client_caps(_client_id uuid)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  service_code text,
  unit_type text,
  monthly_max_units integer,
  weekly_cap_units integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.client_id, b.service_code, b.unit_type,
         b.monthly_max_units, b.weekly_cap_units
  FROM public.client_billing_codes b
  WHERE b.client_id = _client_id
    AND public.is_org_member(b.organization_id, auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.get_client_caps(uuid) TO authenticated;