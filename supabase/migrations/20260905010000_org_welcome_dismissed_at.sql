-- Admin Home Step 3: org-level welcome banner dismissal.
-- Additive only. Null means the banner may still show (see shouldShowWelcome).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS welcome_dismissed_at timestamptz NULL;
