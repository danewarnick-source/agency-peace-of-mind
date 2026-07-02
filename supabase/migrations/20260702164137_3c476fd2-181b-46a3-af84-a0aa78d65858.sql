
-- Add send_mode column (Mode 1 = hive_managed default; Mode 2 = own_domain, not built yet)
ALTER TABLE public.org_email_settings
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'hive_managed';

ALTER TABLE public.org_email_settings
  DROP CONSTRAINT IF EXISTS org_email_settings_send_mode_chk;
ALTER TABLE public.org_email_settings
  ADD CONSTRAINT org_email_settings_send_mode_chk
  CHECK (send_mode IN ('hive_managed','own_domain'));

-- from_address is only required in own_domain mode; allow NULL for hive_managed
ALTER TABLE public.org_email_settings
  ALTER COLUMN from_address DROP NOT NULL,
  ALTER COLUMN from_address DROP DEFAULT;

-- Backfill: any existing row that already has a from_address was configured
-- for the old "verify your own domain" flow — keep it as own_domain.
UPDATE public.org_email_settings
   SET send_mode = 'own_domain'
 WHERE send_mode = 'hive_managed'
   AND from_address IS NOT NULL
   AND length(trim(from_address)) > 0;

-- Seed a hive_managed row for every org that doesn't have one, so sendEmail
-- can always find a settings row. from_name defaults to the org name.
INSERT INTO public.org_email_settings (organization_id, from_name, from_address, reply_to, verified, send_mode)
SELECT o.id, coalesce(o.name, ''), NULL, NULL, false, 'hive_managed'
  FROM public.organizations o
  LEFT JOIN public.org_email_settings s ON s.organization_id = o.id
 WHERE s.organization_id IS NULL;
