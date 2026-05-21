
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Allow org admins/managers to read profiles of users in their org
DROP POLICY IF EXISTS "org managers read member profiles" ON public.profiles;
CREATE POLICY "org managers read member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = profiles.id
      AND public.is_org_admin_or_manager(m.organization_id, auth.uid())
  )
);

-- Allow org admins/managers to update profiles of users in their org (deactivate/edit)
DROP POLICY IF EXISTS "org managers update member profiles" ON public.profiles;
CREATE POLICY "org managers update member profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = profiles.id
      AND public.is_org_admin_or_manager(m.organization_id, auth.uid())
  )
);
