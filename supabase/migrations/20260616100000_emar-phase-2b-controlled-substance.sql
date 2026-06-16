-- Phase 2B: eMAR controlled-substance engine schema changes
-- Item 0: Status normalization + CHECK constraint update
-- Item 1: route column
-- Item 2: terminal-status dedupe partial unique index
-- Item 3: second_witness_id column

-- Normalize legacy status values in existing rows
UPDATE public.emar_logs SET status = 'self_administered' WHERE status IN ('administered', 'Passed');
UPDATE public.emar_logs SET status = 'omitted'          WHERE status IN ('held', 'Held');
UPDATE public.emar_logs SET status = 'refused'          WHERE status = 'Refused';
UPDATE public.emar_logs SET status = 'missed'           WHERE status = 'Missed';

-- Replace status CHECK constraint
ALTER TABLE public.emar_logs DROP CONSTRAINT IF EXISTS emar_logs_status_check;
ALTER TABLE public.emar_logs ADD CONSTRAINT emar_logs_status_check
  CHECK (status IN ('self_administered', 'refused', 'omitted', 'missed'));

-- Add route column (nullable; populated on new inserts)
ALTER TABLE public.emar_logs ADD COLUMN IF NOT EXISTS route text;

-- Partial unique index: prevents a second terminal-status row for the same
-- medication + scheduled window. back-to-back inserts of the same dose land here.
CREATE UNIQUE INDEX IF NOT EXISTS emar_logs_terminal_dedupe
  ON public.emar_logs (medication_id, scheduled_for)
  WHERE status IN ('self_administered', 'refused', 'omitted', 'missed');

-- Second-witness column for controlled-substance double-check protocol
ALTER TABLE public.emar_logs ADD COLUMN IF NOT EXISTS second_witness_id uuid
  REFERENCES public.profiles(id);
