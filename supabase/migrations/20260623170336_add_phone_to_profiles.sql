-- Add phone column to profiles for contact card on employee profile.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
