
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_chk
  CHECK (account_status IN ('active','archived'));

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_account_status_chk;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_account_status_chk
  CHECK (account_status IN ('active','archived'));

CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_clients_account_status ON public.clients(account_status);
