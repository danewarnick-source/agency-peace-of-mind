ALTER TABLE public.provider_authorized_codes
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS provider_authorized_codes_archived_at_idx
  ON public.provider_authorized_codes (organization_id, archived_at);

COMMENT ON COLUMN public.provider_authorized_codes.archived_at IS
  'Soft-archive marker for manual/inferred codes that admin confirmed do NOT belong on the contract. Never hard-deleted (7-year retention). NULL = live.';
COMMENT ON COLUMN public.provider_authorized_codes.confirmed_at IS
  'Admin confirmed this code belongs on the contract (for manual/inferred sources).';