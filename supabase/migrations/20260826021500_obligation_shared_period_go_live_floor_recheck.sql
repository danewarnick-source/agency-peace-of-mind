-- Between the 20260825204500 migration (which cleared the same stale rows)
-- and the go-live-floor code fix actually deploying, a page load ran the
-- OLD generator and recreated the exact same pre-go-live shared-period
-- instances (e.g. an annual report due 2025-08-30 for an org that went
-- live 2026-07-01). Re-apply the same cleanup now that the fix is live so
-- these don't linger as impossible 300+ day overdue items. Idempotent — a
-- no-op once nothing predates go-live.

DELETE FROM public.company_obligation_instances i
USING public.company_obligations o, public.organizations org
WHERE i.obligation_id = o.id
  AND i.organization_id = org.id
  AND i.assignee_staff_id IS NULL
  AND i.status IN ('pending', 'overdue')
  AND i.due_at < coalesce(org.go_live_date::timestamptz, org.created_at);
