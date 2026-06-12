
-- 1. History table
CREATE TABLE public.client_billing_code_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_code_id uuid NOT NULL REFERENCES public.client_billing_codes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  service_code text NOT NULL,
  unit_type text NOT NULL,
  rate_per_unit numeric(12,4) NOT NULL,
  effective_start date,
  effective_end date,
  rate_source text,
  rate_source_plan_number text,
  rate_source_document_id uuid,
  rate_source_at timestamptz,
  superseded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cbcrh_lookup
  ON public.client_billing_code_rate_history (organization_id, client_id, service_code, effective_start);
CREATE INDEX idx_cbcrh_billing_code
  ON public.client_billing_code_rate_history (billing_code_id);

GRANT SELECT, INSERT ON public.client_billing_code_rate_history TO authenticated;
GRANT ALL ON public.client_billing_code_rate_history TO service_role;

ALTER TABLE public.client_billing_code_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read rate history"
  ON public.client_billing_code_rate_history
  FOR SELECT
  TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins write rate history"
  ON public.client_billing_code_rate_history
  FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- 2. Trigger: capture prior version on rate/effective-date/unit-type change
CREATE OR REPLACE FUNCTION public.capture_client_billing_code_rate_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.rate_per_unit IS DISTINCT FROM NEW.rate_per_unit
     OR OLD.unit_type IS DISTINCT FROM NEW.unit_type
     OR OLD.service_start_date IS DISTINCT FROM NEW.service_start_date
     OR OLD.service_end_date IS DISTINCT FROM NEW.service_end_date THEN
    INSERT INTO public.client_billing_code_rate_history (
      billing_code_id, organization_id, client_id, service_code, unit_type,
      rate_per_unit, effective_start, effective_end,
      rate_source, rate_source_plan_number, rate_source_document_id, rate_source_at,
      superseded_at, superseded_by
    ) VALUES (
      OLD.id, OLD.organization_id, OLD.client_id, OLD.service_code, OLD.unit_type,
      OLD.rate_per_unit, OLD.service_start_date, OLD.service_end_date,
      OLD.rate_source, OLD.rate_source_plan_number, OLD.rate_source_document_id, OLD.rate_source_at,
      now(), auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cbc_capture_rate_history ON public.client_billing_codes;
CREATE TRIGGER trg_cbc_capture_rate_history
  BEFORE UPDATE ON public.client_billing_codes
  FOR EACH ROW EXECUTE FUNCTION public.capture_client_billing_code_rate_history();

-- 3. Read API: rate as of a date
CREATE OR REPLACE FUNCTION public.get_rate_as_of(
  _client_id uuid,
  _service_code text,
  _as_of date
)
RETURNS TABLE (
  rate_per_unit numeric,
  unit_type text,
  effective_start date,
  effective_end date,
  rate_source text,
  rate_source_plan_number text,
  source_kind text  -- 'current' or 'history'
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.client_billing_codes
   WHERE client_id = _client_id AND service_code = upper(_service_code)
   LIMIT 1;

  IF v_org IS NULL THEN RETURN; END IF;

  IF NOT (is_org_admin_or_manager(v_org, auth.uid()) OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to read rates';
  END IF;

  -- Try current row first
  RETURN QUERY
  SELECT b.rate_per_unit, b.unit_type, b.service_start_date, b.service_end_date,
         b.rate_source, b.rate_source_plan_number, 'current'::text
    FROM public.client_billing_codes b
   WHERE b.client_id = _client_id
     AND b.service_code = upper(_service_code)
     AND (b.service_start_date IS NULL OR b.service_start_date <= _as_of)
     AND (b.service_end_date   IS NULL OR b.service_end_date   >= _as_of)
   LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Fall back to history: most recent superseded row whose window contains the date
  RETURN QUERY
  SELECT h.rate_per_unit, h.unit_type, h.effective_start, h.effective_end,
         h.rate_source, h.rate_source_plan_number, 'history'::text
    FROM public.client_billing_code_rate_history h
   WHERE h.client_id = _client_id
     AND h.service_code = upper(_service_code)
     AND (h.effective_start IS NULL OR h.effective_start <= _as_of)
     AND (h.effective_end   IS NULL OR h.effective_end   >= _as_of)
   ORDER BY h.superseded_at DESC
   LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rate_as_of(uuid, text, date) TO authenticated;
