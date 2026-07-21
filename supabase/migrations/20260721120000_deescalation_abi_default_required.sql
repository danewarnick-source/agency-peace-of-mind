-- De-escalation / ABI training requirement is now an explicit Required/Exempt
-- setting decided by the provider (no more auto-detection from client
-- caseload). Every staffer defaults to Required until an admin deliberately
-- reviews and marks them Exempt.
ALTER TABLE public.profiles
  ALTER COLUMN requires_deescalation SET DEFAULT true,
  ALTER COLUMN requires_abi SET DEFAULT true;

-- Backfill: existing rows were previously an "add extra requirement" flag
-- that defaulted to false (auto-detection covered the rest). That default no
-- longer means anything now that auto-detection is gone, so every existing
-- staffer without an explicit exemption on file must be corrected to
-- Required — nobody has actually been reviewed and exempted yet.
UPDATE public.profiles
  SET requires_deescalation = true, requires_abi = true;
