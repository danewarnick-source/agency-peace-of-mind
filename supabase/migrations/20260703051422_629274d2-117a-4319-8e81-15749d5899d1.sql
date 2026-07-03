CREATE OR REPLACE FUNCTION public.rebuild_wipe_requirements_tns_fake(p_keep_pending boolean DEFAULT false)
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

  ALTER TABLE public.nectar_requirement_approval_events
    DISABLE TRIGGER trg_req_approval_events_no_update;

  BEGIN
    IF p_keep_pending THEN
      -- Commit path: delete only OLD requirements (no rebuild_pending flag)
      -- and their approval-event trail. Keep new pending rows intact so the
      -- caller can clear the pending flag afterwards.
      DELETE FROM public.nectar_requirement_approval_events e
       USING public.nectar_requirements r
       WHERE e.requirement_id = r.id
         AND r.organization_id = v_org
         AND COALESCE((r.metadata ->> 'rebuild_pending')::boolean, false) = false;

      DELETE FROM public.nectar_requirements
       WHERE organization_id = v_org
         AND COALESCE((metadata ->> 'rebuild_pending')::boolean, false) = false;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
    ELSE
      -- Full-wipe path (legacy): delete everything for the org.
      DELETE FROM public.nectar_requirement_approval_events
       WHERE organization_id = v_org;

      DELETE FROM public.nectar_requirements
       WHERE organization_id = v_org;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.nectar_requirement_approval_events
      ENABLE TRIGGER trg_req_approval_events_no_update;
    RAISE;
  END;

  ALTER TABLE public.nectar_requirement_approval_events
    ENABLE TRIGGER trg_req_approval_events_no_update;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_wipe_requirements_tns_fake(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_wipe_requirements_tns_fake(boolean) TO authenticated;