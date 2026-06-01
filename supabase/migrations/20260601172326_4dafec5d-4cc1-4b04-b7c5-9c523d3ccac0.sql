
ALTER TABLE public.client_billing_codes
  ADD COLUMN IF NOT EXISTS rate_source text,
  ADD COLUMN IF NOT EXISTS rate_source_plan_number text,
  ADD COLUMN IF NOT EXISTS rate_source_document_id uuid REFERENCES public.client_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_source_at timestamptz;
