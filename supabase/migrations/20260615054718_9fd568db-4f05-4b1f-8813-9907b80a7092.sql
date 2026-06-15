CREATE OR REPLACE FUNCTION public.sync_client_authorized_codes_from_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND (service_end_date IS NULL OR service_end_date > CURRENT_DATE)
  ) sub
  WHERE c.id = affected_client;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_client_authorized_codes ON public.client_billing_codes;
CREATE TRIGGER trg_sync_client_authorized_codes
AFTER INSERT OR DELETE OR UPDATE OF service_code, client_id, service_end_date
ON public.client_billing_codes
FOR EACH ROW EXECUTE FUNCTION public.sync_client_authorized_codes_from_billing();

-- Backfill: recompute authorized arrays for every client from OPEN rows only.
UPDATE public.clients c
SET authorized_dspd_codes = COALESCE(sub.codes, ARRAY[]::text[]),
    job_code              = COALESCE(sub.codes, ARRAY[]::text[])
FROM (
  SELECT cl.id AS client_id,
         (SELECT array_agg(DISTINCT cbc.service_code ORDER BY cbc.service_code)
            FROM public.client_billing_codes cbc
           WHERE cbc.client_id = cl.id
             AND (cbc.service_end_date IS NULL OR cbc.service_end_date > CURRENT_DATE)
         ) AS codes
  FROM public.clients cl
) sub
WHERE c.id = sub.client_id;