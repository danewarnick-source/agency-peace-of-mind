
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS day_program_session_id uuid
    REFERENCES public.day_program_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_evv_day_program_session
  ON public.evv_timesheets(day_program_session_id)
  WHERE day_program_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_evv_day_program_session_client
  ON public.evv_timesheets(day_program_session_id, client_id)
  WHERE day_program_session_id IS NOT NULL;

ALTER TABLE public.evv_timesheets
  DROP CONSTRAINT IF EXISTS evv_timesheets_shift_entry_type_check;

ALTER TABLE public.evv_timesheets
  ADD CONSTRAINT evv_timesheets_shift_entry_type_check
  CHECK (shift_entry_type = ANY (ARRAY[
    'Client_Profile_Pass'::text,
    'General_Sidebar_Unscheduled'::text,
    'Day_Program_Attendance'::text
  ]));
