-- After switching per-person obligation due math to
-- max(hire_date|start_date, profile.created_at), delete open instances that
-- were computed from an ancient hire date (or are due before the staff
-- member existed in HIVE). Bootstrap regenerates them on next Compliance load.
--
-- assignees / completions cascade from company_obligation_instances.

DELETE FROM public.company_obligation_instances i
USING public.profiles p, public.company_obligations o
WHERE i.assignee_staff_id = p.id
  AND i.obligation_id = o.id
  AND i.status IN ('pending', 'overdue')
  AND i.assignee_staff_id IS NOT NULL
  AND (
    -- Impossible: owed before the person was on the platform
    i.due_at < p.created_at
    OR (
      -- Hire predates HIVE add and the duty is hire-based — regenerate under
      -- the platform-effective start formula.
      p.hire_date IS NOT NULL
      AND p.created_at::date > p.hire_date
      AND (
        o.due_day_config ? 'days_after_hire'
        OR coalesce(o.due_day_config->>'anniversary_based', '') = 'true'
        OR o.due_day_config ? 'every_n_months'
      )
    )
  );
