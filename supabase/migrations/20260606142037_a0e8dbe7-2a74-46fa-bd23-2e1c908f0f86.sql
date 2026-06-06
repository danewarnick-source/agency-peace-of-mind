INSERT INTO public.staff_checklist_completion
  (organization_id, staff_id, requirement_id, status,
   completed_date, completed_by, training_completion_id, auto_checked_at, notes)
SELECT om.organization_id, tc.user_id, r.id, 'complete',
       (tc.completed_at AT TIME ZONE 'UTC')::date, tc.user_id, tc.id, now(),
       'Backfilled from signed training: ' || COALESCE(tc.topic_title, tc.topic_code, '(topic)')
FROM public.training_completions tc
JOIN public.organization_members om ON om.user_id = tc.user_id AND om.active
JOIN public.training_checklist_mappings m ON m.training_topic_id = tc.ref_id AND m.is_active
JOIN public.nectar_requirements r
  ON r.organization_id = om.organization_id
 AND r.requirement_key = m.requirement_key
 AND r.approval_state = 'provider_confirmed'
 AND COALESCE(r.metadata->>'scope','') = 'hr_staff_checklist'
WHERE tc.is_current = true
  AND tc.topic_kind = 'core'
  AND tc.typed_signature IS NOT NULL
ON CONFLICT (staff_id, requirement_id) DO UPDATE
  SET status = 'complete',
      completed_date = EXCLUDED.completed_date,
      completed_by = EXCLUDED.completed_by,
      training_completion_id = EXCLUDED.training_completion_id,
      auto_checked_at = EXCLUDED.auto_checked_at,
      notes = EXCLUDED.notes,
      updated_at = now()
  WHERE staff_checklist_completion.status <> 'complete'
     OR staff_checklist_completion.training_completion_id IS NULL;