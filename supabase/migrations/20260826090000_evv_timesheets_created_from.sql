-- Compass voice agent (Phase 2): lets the admin compliance view distinguish
-- voice-initiated clock-ins from punch-pad clock-ins. Mirrors the
-- created_from convention already used on scheduled_shifts. Nullable —
-- existing rows predate this column and stay untagged (implicitly punch pad).

ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS created_from text;

COMMENT ON COLUMN public.evv_timesheets.created_from IS
  'Origin of this clock-in entry point, e.g. "voice_agent". Null for punch-pad and historical rows.';
