-- Company Obligations: add `scope` (org / staff / staff_per_client) and
-- client targeting so obligations can generate one shared org instance, one
-- instance per staff member, or one instance per staff+client assignment
-- (e.g. client-specific training due 30 days after a caseload assignment).
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'staff'
    CHECK (scope IN ('org', 'staff', 'staff_per_client')),
  ADD COLUMN IF NOT EXISTS target_service_codes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.company_obligation_instances
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_name text;

ALTER TABLE public.company_obligation_instance_assignees
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_name text;

-- Existing six universal SOW obligations are staff-scoped (already the
-- column default, but set explicitly for clarity/idempotency).
UPDATE public.company_obligations
SET scope = 'staff'
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND source = 'sow';

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_client
  ON public.company_obligation_instances(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_obligation_instances_staff_client
  ON public.company_obligation_instances(assignee_staff_id, client_id)
  WHERE assignee_staff_id IS NOT NULL AND client_id IS NOT NULL;

-- staff_per_client instances are unique per (obligation, assignee, client,
-- period) — multiple clients can share the same period_key text (e.g. two
-- different one-time client trainings both use "Assigned <date>"), so the
-- existing per-person partial unique index (obligation_id, period_key,
-- assignee_staff_id) isn't enough on its own; add a client-scoped variant
-- and narrow the person-only one to rows without a client_id.
DROP INDEX IF EXISTS idx_company_obligation_instances_person_period;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_person_period
  ON public.company_obligation_instances(obligation_id, period_key, assignee_staff_id)
  WHERE assignee_staff_id IS NOT NULL AND client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_obligation_instances_person_client_period
  ON public.company_obligation_instances(obligation_id, period_key, assignee_staff_id, client_id)
  WHERE assignee_staff_id IS NOT NULL AND client_id IS NOT NULL;
