-- Shared (org-level) calendar-period obligation instances (e.g. annual
-- reports whose "most recently elapsed" occurrence hadn't happened yet this
-- year) were being generated a full prior cycle back, landing before the
-- org's go_live_date — e.g. an annual report due 2025-08-30 for an org that
-- didn't start using HIVE until 2026-07-01. That produced impossible
-- 300+ day overdue rows. Code now floors shared-period generation at
-- organizations.go_live_date (see fetchOrgGoLiveDate in
-- company-obligations.functions.ts); this clears the already-generated
-- stale rows so the next bootstrap regenerates the correct current period.
--
-- Only removes org-shared instances (assignee_staff_id IS NULL) that are
-- still open (pending/overdue) and closed before go-live — never touches
-- completed instances or per-person/per-client rows.

DELETE FROM public.company_obligation_instances i
USING public.company_obligations o, public.organizations org
WHERE i.obligation_id = o.id
  AND i.organization_id = org.id
  AND i.assignee_staff_id IS NULL
  AND i.status IN ('pending', 'overdue')
  AND i.due_at < coalesce(org.go_live_date::timestamptz, org.created_at);
