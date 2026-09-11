-- Soft-retire per-client Person-Centered Thinking.
-- Hire-level "Person-Centered Thinking and Practices Training" is unchanged.
-- No RLS changes. No deletes of completions or client_specific_trainings.

UPDATE public.company_obligations
SET active = false
WHERE title = 'Person-Centered Thinking — [Client Name]'
  AND active IS DISTINCT FROM false;

UPDATE public.company_obligation_instances i
SET status = 'waived',
    waive_reason = 'Retired: Person-Centered Thinking is hire-level staff training once, not a per-client form.'
WHERE i.status IN ('pending', 'overdue')
  AND i.obligation_id IN (
    SELECT o.id FROM public.company_obligations o
    WHERE o.title = 'Person-Centered Thinking — [Client Name]'
  );
