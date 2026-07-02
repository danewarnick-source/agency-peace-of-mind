ALTER TABLE public.import_documents
  ADD COLUMN IF NOT EXISTS client_key   text,
  ADD COLUMN IF NOT EXISTS client_label text;
CREATE INDEX IF NOT EXISTS import_documents_job_client_key_idx
  ON public.import_documents (import_job_id, client_key);