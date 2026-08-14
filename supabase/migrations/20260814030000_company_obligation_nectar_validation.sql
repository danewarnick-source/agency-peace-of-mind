-- NECTAR document intelligence for Company Obligations uploads: run OCR
-- against uploaded evidence, validate against the obligation's expected
-- cert type / keyword groups / name match, and record the result so the UI
-- can show pass/fail and admins can override a failed validation.

-- company_obligations.nectar_cert_type_label / nectar_keyword_groups were
-- already added in the seed-defaults migration; this is a defensive no-op
-- if this migration runs on a database that doesn't have that one yet.
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS nectar_cert_type_label text,
  ADD COLUMN IF NOT EXISTS nectar_keyword_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.company_obligation_completions
  ADD COLUMN IF NOT EXISTS nectar_validation_status text CHECK (nectar_validation_status IN ('passed', 'failed')),
  ADD COLUMN IF NOT EXISTS nectar_validation_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nectar_extracted_cert_type text,
  ADD COLUMN IF NOT EXISTS nectar_extracted_name text,
  ADD COLUMN IF NOT EXISTS nectar_extracted_completed_date date,
  ADD COLUMN IF NOT EXISTS nectar_extracted_expires_date date,
  ADD COLUMN IF NOT EXISTS nectar_name_match text CHECK (nectar_name_match IN ('match', 'mismatch', 'unreadable')),
  ADD COLUMN IF NOT EXISTS nectar_confidence numeric;

-- admin_notes already exists on company_obligation_instances (used by the
-- waive flow); company_obligation_completions needs its own for the
-- "admin override" note left when confirming a failed NECTAR validation.
ALTER TABLE public.company_obligation_completions
  ADD COLUMN IF NOT EXISTS admin_notes text;
