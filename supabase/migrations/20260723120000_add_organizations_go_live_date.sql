-- go_live_date marks when an org actually started using HIVE. Without it the
-- system cannot distinguish "this never happened" from "this happened before
-- HIVE" — deadlines, audit packets, and daily-note completeness all need a
-- floor so they never flag pre-adoption history as a compliance gap.
-- Nullable: callers must treat NULL as "defaults to organizations.created_at"
-- (conservative — never assumes documentation exists before the org even
-- had an account).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS go_live_date date;

-- Snapshot disclosure shown on the audit packet when its requested timeline
-- overlaps the pre-HIVE period. Computed once at packet-creation time so the
-- disclosure a provider saw when they built the packet doesn't silently
-- change later if go_live_date is edited.
ALTER TABLE public.audit_packets
  ADD COLUMN IF NOT EXISTS predates_go_live_note text;
