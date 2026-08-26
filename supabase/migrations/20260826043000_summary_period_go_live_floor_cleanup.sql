-- The go-live floor for progress-summary generation (summaryPeriodFloor /
-- filterPeriodsByFloor in src/lib/progress-summaries.ts, added by the
-- "Summaries redesign" work) only guards NEW rows going forward. It does
-- not retroactively remove periods that were generated before that floor
-- existed — e.g. a quarterly summary for 2025-Q3 (period_end 2025-09-30)
-- for an org that didn't go live on HIVE until 2026-07-01. Those show up
-- in the UI as impossible "overdue since 2025" rows.
--
-- Clear open (not completed/finalized) rows whose period closed before the
-- later of the org's go-live date and the client's own HIVE start date —
-- same floor formula as summaryPeriodFloor(). ensureCurrentSummaryPeriods
-- regenerates the correct current period on next page load. Never touches
-- completed/finalized rows (real historical work stays).

DELETE FROM public.client_progress_summaries cps
USING public.clients c, public.organizations org
WHERE cps.client_id = c.id
  AND cps.organization_id = org.id
  AND cps.completed_at IS NULL
  AND cps.finalized_at IS NULL
  AND cps.period_end < greatest(
        coalesce(org.go_live_date::timestamptz, org.created_at),
        coalesce(c.hive_start_date::timestamptz, c.created_at)
      );
