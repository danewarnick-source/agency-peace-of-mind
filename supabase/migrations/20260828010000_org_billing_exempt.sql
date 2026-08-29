-- HIVE Stripe billing: billing_exempt flag + True North Supports never charged.
-- Org admins cannot flip this column (trigger). Hive Exec uses a server function
-- with the service role. Members can read it so the paywall can skip TNS.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS organizations_billing_exempt_idx
  ON public.organizations (id)
  WHERE billing_exempt = true;

-- True North Supports LLC — first tenant, never billed.
UPDATE public.organizations
SET billing_exempt = true
WHERE billing_exempt = false
  AND (
    name ILIKE '%true north supports%'
    OR COALESCE(legal_name, '') ILIKE '%true north supports%'
    OR COALESCE(dba_name, '') ILIKE '%true north supports%'
  );

-- Un-lock any exempt company (TNS included).
UPDATE public.org_subscriptions s
SET
  locked_at = NULL,
  lock_reason = NULL,
  past_due_since = NULL,
  status = CASE
    WHEN s.status IN ('paused', 'trial', 'locked') THEN 'active'::public.sub_status
    ELSE s.status
  END
FROM public.organizations o
WHERE s.organization_id = o.id
  AND o.billing_exempt = true
  AND (s.locked_at IS NOT NULL OR s.status IN ('paused', 'trial', 'locked'));

-- Only Hive Executives (or SQL / service role) may change billing_exempt.
CREATE OR REPLACE FUNCTION public.protect_billing_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt THEN
    -- service role / SQL editor: auth.uid() is null
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    IF NOT public.is_hive_executive(auth.uid()) THEN
      RAISE EXCEPTION 'Only a Hive Executive can mark a company billing-exempt';
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

-- Hive Exec can update org rows they are not members of (comped toggle).
DROP POLICY IF EXISTS "hive execs update organizations" ON public.organizations;
CREATE POLICY "hive execs update organizations"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));
