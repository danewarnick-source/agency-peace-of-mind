DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', r.tablename);
  END LOOP;
END$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.%I TO authenticated;', r.sequence_name);
    EXECUTE format('GRANT ALL ON SEQUENCE public.%I TO service_role;', r.sequence_name);
  END LOOP;
END$$;

-- training-assets storage: allow admins/super_admins to manage any {org_id}/... path
DROP POLICY IF EXISTS "training assets admin manage" ON storage.objects;
CREATE POLICY "training assets admin manage"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'training-assets'
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','super_admin')
    )
  )
)
WITH CHECK (
  bucket_id = 'training-assets'
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.active
        AND om.role IN ('admin','super_admin')
    )
  )
);