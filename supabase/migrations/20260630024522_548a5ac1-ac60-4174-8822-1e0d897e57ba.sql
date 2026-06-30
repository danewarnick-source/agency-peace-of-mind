-- Prompt 22: additive client toggles + health-team fields.
-- All additive; no destructive changes. Defaults false / null so existing rows unaffected.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS has_abi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnr_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pcp_name text,
  ADD COLUMN IF NOT EXISTS pcp_phone text,
  ADD COLUMN IF NOT EXISTS specialist_name text,
  ADD COLUMN IF NOT EXISTS specialist_phone text,
  ADD COLUMN IF NOT EXISTS med_prescriber_name text,
  ADD COLUMN IF NOT EXISTS med_prescriber_phone text;
COMMENT ON COLUMN public.clients.has_abi IS 'Acquired Brain Injury flag. When true, staff must complete ABI training before being assigned or scheduled with this client (see hr-staff.functions.ts).';
COMMENT ON COLUMN public.clients.hr_applicable IS 'Human Rights documentation applies. When true, a human_rights document upload is required.';
COMMENT ON COLUMN public.clients.dnr_applicable IS 'DNR order applies. When true, a dnr document upload is required.';