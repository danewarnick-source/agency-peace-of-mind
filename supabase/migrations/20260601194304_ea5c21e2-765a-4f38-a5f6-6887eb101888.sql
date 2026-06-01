ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS nectar_drafted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nectar_drafted_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS nectar_drafted_confirmed_by uuid;