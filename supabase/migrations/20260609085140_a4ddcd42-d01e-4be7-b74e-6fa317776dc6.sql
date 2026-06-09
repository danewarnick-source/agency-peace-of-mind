
-- White-glove migration extensions for the shared import engine.

-- 1. Extend import_jobs with engagement + sign-off fields
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS provider_signoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_signoff_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS engagement_status text NOT NULL DEFAULT 'quoted',
  ADD COLUMN IF NOT EXISTS quote_amount_cents integer;

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_engagement_status_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_engagement_status_check
  CHECK (engagement_status IN ('quoted','in_progress','review','complete'));

-- 2. Loosen source check to allow white_glove
ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_source_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_source_check
  CHECK (source IN ('self_service','white_glove'));

-- 3. HIVE access log — every staff touch on a customer's import
CREATE TABLE IF NOT EXISTS public.import_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  target_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_access_log_job ON public.import_access_log(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_access_log_target ON public.import_access_log(target_org_id);

GRANT SELECT, INSERT ON public.import_access_log TO authenticated;
GRANT ALL ON public.import_access_log TO service_role;
ALTER TABLE public.import_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_access_log hive insert" ON public.import_access_log
  FOR INSERT TO authenticated
  WITH CHECK (is_hive_executive(auth.uid()) AND actor = auth.uid());

CREATE POLICY "import_access_log read" ON public.import_access_log
  FOR SELECT TO authenticated
  USING (
    is_hive_executive(auth.uid())
    OR (target_org_id IS NOT NULL AND has_org_role(target_org_id, auth.uid(), 'admin'::app_role))
  );

-- 4. Extend staging RLS so HIVE execs (prep) and target-org admins (sign-off)
--    can access the shared engine alongside the job's own org admin.
DROP POLICY IF EXISTS "import_jobs admin manage" ON public.import_jobs;
CREATE POLICY "import_jobs admin manage" ON public.import_jobs
  FOR ALL TO authenticated
  USING (
    has_org_role(org_id, auth.uid(), 'admin'::app_role)
    OR has_org_role(org_id, auth.uid(), 'super_admin'::app_role)
    OR is_hive_executive(auth.uid())
    OR (target_org_id IS NOT NULL AND has_org_role(target_org_id, auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    has_org_role(org_id, auth.uid(), 'admin'::app_role)
    OR has_org_role(org_id, auth.uid(), 'super_admin'::app_role)
    OR is_hive_executive(auth.uid())
    OR (target_org_id IS NOT NULL AND has_org_role(target_org_id, auth.uid(), 'admin'::app_role))
  );

-- helper to extend other staging tables in one expression
CREATE OR REPLACE FUNCTION public.can_access_import_job(_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.import_jobs j
    WHERE j.id = _job_id
      AND (
        has_org_role(j.org_id, auth.uid(), 'admin'::app_role)
        OR has_org_role(j.org_id, auth.uid(), 'super_admin'::app_role)
        OR is_hive_executive(auth.uid())
        OR (j.target_org_id IS NOT NULL AND has_org_role(j.target_org_id, auth.uid(), 'admin'::app_role))
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_import_job(uuid) TO authenticated;

DO $$
DECLARE
  t text;
  staging text[] := ARRAY[
    'import_subjects','extracted_fields','import_documents','unfiled_items',
    'assignment_map','provisioning_plan','import_cert_documents',
    'import_nectar_questions','import_field_provenance'
  ];
BEGIN
  FOREACH t IN ARRAY staging LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' admin manage', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (public.can_access_import_job(import_job_id))
        WITH CHECK (public.can_access_import_job(import_job_id))
    $f$, t || ' admin manage', t);
  END LOOP;
END $$;

-- audit is append-only; extend read + insert similarly
DROP POLICY IF EXISTS "import_audit admin insert" ON public.import_audit;
DROP POLICY IF EXISTS "import_audit admin read" ON public.import_audit;
CREATE POLICY "import_audit insert" ON public.import_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_import_job(import_job_id));
CREATE POLICY "import_audit read" ON public.import_audit
  FOR SELECT TO authenticated
  USING (public.can_access_import_job(import_job_id));
