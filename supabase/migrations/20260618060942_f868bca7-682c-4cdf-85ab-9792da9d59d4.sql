
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS account_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS account_contact_email TEXT;

-- Backfill name from creator's profile
UPDATE public.organizations o
SET account_contact_name = p.full_name
FROM public.profiles p
WHERE o.account_contact_name IS NULL
  AND o.created_by IS NOT NULL
  AND p.id = o.created_by
  AND p.full_name IS NOT NULL;

-- Backfill email from creator's auth user
UPDATE public.organizations o
SET account_contact_email = u.email
FROM auth.users u
WHERE o.account_contact_email IS NULL
  AND o.created_by IS NOT NULL
  AND u.id = o.created_by
  AND u.email IS NOT NULL;
