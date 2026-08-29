-- Host supervision contacts: recreate the three live policies
-- TO authenticated only.
-- Original CREATE POLICY omitted TO, so Postgres granted them to PUBLIC
-- (anon + authenticated). USING/WITH CHECK already require
-- is_org_member / is_org_admin_or_manager, so a null uid still gets
-- zero rows. Launch-ready RLS should not attach these policies to public.

DROP POLICY IF EXISTS "org members read supervision" ON public.host_supervision_contacts;
CREATE POLICY "org members read supervision"
  ON public.host_supervision_contacts
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "org managers write supervision" ON public.host_supervision_contacts;
CREATE POLICY "org managers write supervision"
  ON public.host_supervision_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

DROP POLICY IF EXISTS "org managers update supervision" ON public.host_supervision_contacts;
CREATE POLICY "org managers update supervision"
  ON public.host_supervision_contacts
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));
