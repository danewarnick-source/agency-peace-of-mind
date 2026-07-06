
CREATE OR REPLACE FUNCTION public.nectar_on_authorized_code_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.nectar_requirements r
     SET activation_state = 'pending_code_activation'
   WHERE r.organization_id = NEW.organization_id
     AND r.obligation_category = 'billing_code'
     AND (r.service_code = NEW.code
          OR NEW.code = ANY(COALESCE(r.service_codes_all, ARRAY[]::text[])))
     AND r.activation_state NOT IN ('active_by_code','pending_code_activation');
  RETURN NEW;
END;
$$;
