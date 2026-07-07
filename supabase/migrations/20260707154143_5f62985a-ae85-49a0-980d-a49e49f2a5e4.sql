-- Adds missing staff contact fields on profiles so the staff profile edit
-- can persist phone + emergency contact. RLS on profiles is already
-- org-scoped; no new policies needed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;