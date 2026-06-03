-- Drop the overly permissive SELECT policy that allowed any org member
DROP POLICY IF EXISTS "ledger_select_org_members" ON public.provider_ledger_entries;

-- Create admin-only SELECT policy matching existing write policies
CREATE POLICY "ledger_select_admins"
ON public.provider_ledger_entries
FOR SELECT
TO authenticated
USING (
  public.has_org_role(organization_id, auth.uid(), 'admin'::app_role)
  OR public.has_org_role(organization_id, auth.uid(), 'super_admin'::app_role)
);