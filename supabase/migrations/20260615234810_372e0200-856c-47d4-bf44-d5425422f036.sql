ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS admin_hours_per_week numeric(6,2);

COMMENT ON COLUMN public.clients.admin_hours_per_week IS
  'HHS host-home administrative hours per week. NULL means unset.';