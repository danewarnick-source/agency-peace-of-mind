ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS mailing_address text,
  ADD COLUMN IF NOT EXISTS support_coordinator_company text;