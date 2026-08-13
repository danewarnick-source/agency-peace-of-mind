-- Distinguish state-contract-mandated obligations (DHHS91172 SOW) from
-- provider-authored ones, and let SOW obligations be marked non-editable so
-- admins can't accidentally weaken a state requirement. Purely additive —
-- both columns default such that existing rows stay provider/unlocked.
ALTER TABLE public.company_obligations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'provider'
    CHECK (source IN ('sow', 'provider')),
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
