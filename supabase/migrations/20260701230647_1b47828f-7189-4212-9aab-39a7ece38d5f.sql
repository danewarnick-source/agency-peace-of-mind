
ALTER TABLE public.billing_code_approval_requests
  ADD COLUMN IF NOT EXISTS resolved_signature_name TEXT,
  ADD COLUMN IF NOT EXISTS resolved_signature_attested BOOLEAN,
  ADD COLUMN IF NOT EXISTS resolved_signature_at TIMESTAMPTZ;

ALTER TABLE public.billing_code_approval_messages
  ADD COLUMN IF NOT EXISTS resolved_signature_name TEXT,
  ADD COLUMN IF NOT EXISTS resolved_signature_attested BOOLEAN,
  ADD COLUMN IF NOT EXISTS resolved_signature_at TIMESTAMPTZ;
