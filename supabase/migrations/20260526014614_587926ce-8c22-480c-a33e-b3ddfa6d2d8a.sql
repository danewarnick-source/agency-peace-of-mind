ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS shift_note_text text,
  ADD COLUMN IF NOT EXISTS goals_completed jsonb NOT NULL DEFAULT '[]'::jsonb;