CREATE OR REPLACE FUNCTION public.rebuild_wipe_requirements_tns_fake()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := '7fabcf5d-f826-487f-8730-8b0c3f1969bb';
  v_deleted integer;
  v_role text;
BEGIN
  SELECT role INTO v_role
    FROM public.organization_members
   WHERE organization_id = v_org
     AND user_id = auth.uid()
     AND active = true;

  IF (v_role IS NULL OR v_role NOT IN ('admin','super_admin'))
     AND NOT public.is_hive_executive(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to rebuild demo requirements.';
  END IF;

  -- Bypass the append-only trigger on approval_events for this maintenance op.
  PERFORM set_config('session_replication_role', 'replica', true);

  DELETE FROM public.nectar_requirement_approval_events
   WHERE organization_id = v_org;

  DELETE FROM public.nectar_requirements
   WHERE organization_id = v_org;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_wipe_requirements_tns_fake() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_wipe_requirements_tns_fake() TO authenticated;