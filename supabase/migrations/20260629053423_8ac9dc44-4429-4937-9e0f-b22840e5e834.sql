ALTER TABLE public.import_subjects
  ADD COLUMN IF NOT EXISTS discarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS discarded_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS import_subjects_pending_client_idx
  ON public.import_subjects (org_id)
  WHERE subject_type = 'client' AND committed_at IS NULL AND discarded_at IS NULL;