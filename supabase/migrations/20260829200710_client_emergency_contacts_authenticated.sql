-- Client emergency contacts are PHI. Recreate the two live policies
-- TO authenticated only.
-- Original CREATE POLICY omitted TO, so Postgres granted them to PUBLIC
-- (anon + authenticated). USING/WITH CHECK already require
-- is_org_member / is_org_admin_or_manager / is_hive_executive, so a
-- null uid still gets zero rows. Launch-ready RLS should not attach
-- these policies to public.

DROP POLICY IF EXISTS "members read emergency contacts" ON public.client_emergency_contacts;
CREATE POLICY "members read emergency contacts"
  ON public.client_emergency_contacts
  FOR SELECT
  TO authenticated
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));

DROP POLICY IF EXISTS "managers write emergency contacts" ON public.client_emergency_contacts;
CREATE POLICY "managers write emergency contacts"
  ON public.client_emergency_contacts
  FOR ALL
  TO authenticated
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
