-- Real state audits request specific document types across independently-
-- random date windows (e.g. "shift notes May-July", "incident reports
-- Nov-Dec"), not one shared range for the whole packet. These columns let a
-- checklist item carry its own period, overriding the packet-level
-- timeline_start/timeline_end when present; NULL means "use the packet's
-- overall timeline" (today's behavior, unchanged).
--
-- is_disclosure marks the pinned, non-dismissable "pre-Hive period" item
-- inserted automatically when a packet's timeline predates the org's
-- go_live_date — distinct from a normal checklist item so the UI can render
-- it first and without a status control.
ALTER TABLE public.audit_packet_items
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS is_disclosure boolean NOT NULL DEFAULT false;
