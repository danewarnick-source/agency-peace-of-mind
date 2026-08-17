ALTER TABLE public.hrc_meetings
  ADD COLUMN IF NOT EXISTS minutes_document_path text,
  ADD COLUMN IF NOT EXISTS minutes_document_name text;