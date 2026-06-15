
CREATE OR REPLACE FUNCTION public.sync_client_authorized_codes_from_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_client uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_client := OLD.client_id;
  ELSE
    affected_client := NEW.client_id;
  END IF;

  UPDATE public.clients c
  SET authorized_dspd_codes = COALESCE(sub.codes, ARRAY[]::text[]),
      job_code              = COALESCE(sub.codes, ARRAY[]::text[])
  FROM (
    SELECT array_agg(DISTINCT service_code ORDER BY service_code) AS codes
    FROM public.client_billing_codes
    WHERE client_id = affected_client
  ) sub
  WHERE c.id = affected_client;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_client_authorized_codes ON public.client_billing_codes;
CREATE TRIGGER trg_sync_client_authorized_codes
AFTER INSERT OR UPDATE OF service_code, client_id OR DELETE
ON public.client_billing_codes
FOR EACH ROW
EXECUTE FUNCTION public.sync_client_authorized_codes_from_billing();

-- One-time backfill: align every client's legacy arrays with their current billing-code rows.
UPDATE public.clients c
SET authorized_dspd_codes = COALESCE(sub.codes, ARRAY[]::text[]),
    job_code              = COALESCE(sub.codes, ARRAY[]::text[])
FROM (
  SELECT client_id, array_agg(DISTINCT service_code ORDER BY service_code) AS codes
  FROM public.client_billing_codes
  GROUP BY client_id
) sub
WHERE c.id = sub.client_id;

-- Clients with no billing-code rows: zero out the legacy arrays.
UPDATE public.clients c
SET authorized_dspd_codes = ARRAY[]::text[],
    job_code              = ARRAY[]::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_billing_codes b WHERE b.client_id = c.id
);
