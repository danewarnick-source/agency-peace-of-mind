-- Idempotent: add the per-client Person-Centered Thinking form obligation
-- and treat Support Strategies as the existing staff form (not a file upload).
-- Does not drop or truncate. Does not invent a new assignment system —
-- instances still come from staff_assignments (same as Client-Specific Training).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    INSERT INTO public.company_obligations (
      organization_id, title, description, source_policy_section, cadence,
      due_day_config, reminder_days_before, evidence_type, requires_individual_completion,
      assignee_role, scope, target_service_codes,
      notify_manager_on_complete, notify_manager_on_overdue, active, source, is_locked
    )
    SELECT
      r.id,
      'Person-Centered Thinking — [Client Name]',
      'Each assigned staff member completes the person-centered thinking form for that client within 30 days of assignment. This is the per-client form — separate from the hire-level Person-Centered Thinking and Practices course.',
      'SOW §1.8(5)(C) — Person-Centered Thinking (per client)',
      'one_time',
      '{"days_after_assignment": 30}'::jsonb,
      ARRAY[14, 7, 3],
      'form',
      true,
      'any_assigned',
      'staff_per_client',
      ARRAY[]::text[],
      true,
      true,
      true,
      'sow',
      true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.company_obligations
      WHERE organization_id = r.id
        AND title = 'Person-Centered Thinking — [Client Name]'
    );

    UPDATE public.company_obligations
    SET evidence_type = 'form'
    WHERE organization_id = r.id
      AND title = 'Support Strategies — [Client Name]'
      AND evidence_type IS DISTINCT FROM 'form';
  END LOOP;
END $$;
