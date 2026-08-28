-- HIVE pricing schedule: list vs founding (first 5 paying orgs, 12 months).
-- Hive Exec can mark a company founding or list. Org admins cannot flip this.
-- True North stays billing_exempt; this flag does not charge them.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pricing_schedule text;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS founding_ends_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_pricing_schedule_chk'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_pricing_schedule_chk
      CHECK (pricing_schedule IS NULL OR pricing_schedule IN ('list', 'founding'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS organizations_pricing_schedule_idx
  ON public.organizations (pricing_schedule)
  WHERE pricing_schedule IS NOT NULL;

-- Only Hive Executives (or SQL / service role) may change billing flags.
CREATE OR REPLACE FUNCTION public.protect_billing_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt
    OR NEW.pricing_schedule IS DISTINCT FROM OLD.pricing_schedule
    OR NEW.founding_ends_at IS DISTINCT FROM OLD.founding_ends_at
  ) THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.is_hive_executive(auth.uid()) THEN
      RAISE EXCEPTION 'Only a Hive Executive can change billing-exempt or founding/list pricing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_billing_exempt ON public.organizations;
CREATE TRIGGER trg_protect_billing_exempt
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_billing_exempt();
