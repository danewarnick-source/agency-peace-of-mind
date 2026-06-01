-- Client spending log: client's own money spent during an hourly shift
CREATE TABLE public.client_spending_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  shift_id UUID NOT NULL REFERENCES public.evv_timesheets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0 AND amount <= 100000),
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 2 AND 500),
  spent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_path TEXT,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_csl_shift ON public.client_spending_log(shift_id);
CREATE INDEX idx_csl_org_client ON public.client_spending_log(organization_id, client_id);
CREATE INDEX idx_csl_staff ON public.client_spending_log(staff_id);
CREATE INDEX idx_csl_spent_at ON public.client_spending_log(spent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_spending_log TO authenticated;
GRANT ALL ON public.client_spending_log TO service_role;

ALTER TABLE public.client_spending_log ENABLE ROW LEVEL SECURITY;

-- Validation trigger: ensure shift is hourly (reject daily-unit service codes)
CREATE OR REPLACE FUNCTION public.enforce_client_spending_hourly_shift()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT service_type_code INTO v_code FROM public.evv_timesheets WHERE id = NEW.shift_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Shift not found for client spending log entry.';
  END IF;
  IF v_code IN ('HHS','RHS','DSG','RL6','RP3','RP4','RP5') THEN
    RAISE EXCEPTION 'Client spending log applies to hourly services only (received daily-unit code %).', v_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_csl_hourly_only
BEFORE INSERT OR UPDATE OF shift_id ON public.client_spending_log
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_spending_hourly_shift();

CREATE TRIGGER trg_csl_updated_at
BEFORE UPDATE ON public.client_spending_log
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: org members can view; staff insert for themselves; staff or admins/managers can update/delete
CREATE POLICY "View client spending in org"
ON public.client_spending_log
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Staff insert own client spending"
ON public.client_spending_log
FOR INSERT TO authenticated
WITH CHECK (
  staff_id = auth.uid()
  AND public.is_org_member(organization_id, auth.uid())
);

CREATE POLICY "Update client spending"
ON public.client_spending_log
FOR UPDATE TO authenticated
USING (
  public.is_org_admin_or_manager(organization_id, auth.uid())
  OR staff_id = auth.uid()
)
WITH CHECK (
  public.is_org_admin_or_manager(organization_id, auth.uid())
  OR staff_id = auth.uid()
);

CREATE POLICY "Delete client spending"
ON public.client_spending_log
FOR DELETE TO authenticated
USING (
  public.is_org_admin_or_manager(organization_id, auth.uid())
  OR staff_id = auth.uid()
);

-- Private storage bucket for receipts (optional per entry)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-spending-receipts', 'client-spending-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {organization_id}/{shift_id}/{entry_id}/{filename}
CREATE POLICY "Org members read client spending receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-spending-receipts'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Org members upload client spending receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-spending-receipts'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Org members delete client spending receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'client-spending-receipts'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);