-- Compass voice notes: persist the staff member's original spoken transcript
-- alongside the Compass-expanded, staff-edited note. Cedar is the scribe;
-- the staff member is the witness. Additive only — no drops, no RLS changes.
-- The new column inherits existing org-scoped policies on both tables.
--
-- Live check 2026-08-27 (Hive-Platform): evv_timesheets and daily_logs have
-- no original-speech column. nectar_raw_input exists only on general_shifts
-- (non-client Training/Admin time — the wrong table). nectar_attestations
-- already has original_staff_input (populated on punch-pad attest in the
-- same product change). See docs/SQL_HANDOFF.md.

ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS original_transcript text;

COMMENT ON COLUMN public.evv_timesheets.original_transcript IS
  'Verbatim staff speech (or pre-expansion shorthand) captured by Compass. Never overwritten by shift_note_text.';

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS original_transcript text;

COMMENT ON COLUMN public.daily_logs.original_transcript IS
  'Verbatim staff speech (or pre-expansion shorthand) captured by Compass. Never overwritten by narrative.';
