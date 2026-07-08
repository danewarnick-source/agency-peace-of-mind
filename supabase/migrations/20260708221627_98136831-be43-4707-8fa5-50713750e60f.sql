-- Unify medication administration record into emar_logs.
-- shift_mar_entries has 0 rows (verified pre-migration) — no data to backfill.
-- Table is intentionally NOT dropped; it stays as a safety backup until the
-- merge is verified live. A later migration will retire it.

ALTER TABLE public.emar_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'emar',
  ADD COLUMN IF NOT EXISTS scheduled_shift_id uuid NULL REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evv_timesheet_id uuid NULL REFERENCES public.evv_timesheets(id) ON DELETE SET NULL;

-- Restrict source to the two known writers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'emar_logs_source_check' AND conrelid = 'public.emar_logs'::regclass
  ) THEN
    ALTER TABLE public.emar_logs
      ADD CONSTRAINT emar_logs_source_check CHECK (source IN ('emar','shift'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS emar_logs_scheduled_shift_id_idx
  ON public.emar_logs (scheduled_shift_id)
  WHERE scheduled_shift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS emar_logs_evv_timesheet_id_idx
  ON public.emar_logs (evv_timesheet_id)
  WHERE evv_timesheet_id IS NOT NULL;

COMMENT ON COLUMN public.emar_logs.source IS
  'Which surface recorded this administration: emar = eMAR (self-admin observed pass), shift = per-shift MAR grid (given/refused/missed/held).';
COMMENT ON COLUMN public.emar_logs.scheduled_shift_id IS
  'Optional link back to the shift that produced this administration (populated when source=shift).';
COMMENT ON COLUMN public.emar_logs.evv_timesheet_id IS
  'Optional link back to the EVV timesheet that produced this administration (populated when source=shift).';
