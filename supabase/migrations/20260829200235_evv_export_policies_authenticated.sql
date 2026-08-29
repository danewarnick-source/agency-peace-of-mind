-- Utah EVV CSV export: recreate manager policies TO authenticated only.
-- Original CREATE POLICY omitted TO, so Postgres granted them to PUBLIC
-- (anon + authenticated). USING/WITH CHECK already require
-- is_org_admin_or_manager, so a null uid still gets zero rows. Launch-ready
-- RLS should not attach these policies to public.

DROP POLICY IF EXISTS "org managers read batches" ON public.evv_export_batches;
CREATE POLICY "org managers read batches"
  ON public.evv_export_batches
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

DROP POLICY IF EXISTS "org managers write batches" ON public.evv_export_batches;
CREATE POLICY "org managers write batches"
  ON public.evv_export_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

DROP POLICY IF EXISTS "org managers read export records" ON public.evv_export_records;
CREATE POLICY "org managers read export records"
  ON public.evv_export_records
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

DROP POLICY IF EXISTS "org managers write export records" ON public.evv_export_records;
CREATE POLICY "org managers write export records"
  ON public.evv_export_records
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
