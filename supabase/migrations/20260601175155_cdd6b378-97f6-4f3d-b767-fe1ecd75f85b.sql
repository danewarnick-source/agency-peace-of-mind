
-- Activity reimbursement requests submitted by staff during a shift
CREATE TABLE public.activity_reimbursement_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  shift_id UUID NOT NULL REFERENCES public.evv_timesheets(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  client_id UUID,
  activity_description TEXT NOT NULL CHECK (length(activity_description) BETWEEN 3 AND 2000),
  estimated_cost NUMERIC(10,2) NOT NULL CHECK (estimated_cost >= 0 AND estimated_cost <= 100000),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  receipt_paths TEXT[] NOT NULL DEFAULT '{}'::text[],
  event_summary TEXT,
  summary_submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_arr_shift ON public.activity_reimbursement_requests(shift_id);
CREATE INDEX idx_arr_org_status ON public.activity_reimbursement_requests(organization_id, status);
CREATE INDEX idx_arr_staff ON public.activity_reimbursement_requests(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_reimbursement_requests TO authenticated;
GRANT ALL ON public.activity_reimbursement_requests TO service_role;

ALTER TABLE public.activity_reimbursement_requests ENABLE ROW LEVEL SECURITY;

-- Staff can view their own requests; org members (admins/managers) can view all in their org
CREATE POLICY "View org reimbursement requests"
ON public.activity_reimbursement_requests
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

-- Staff create their own requests in their org
CREATE POLICY "Staff insert own reimbursement requests"
ON public.activity_reimbursement_requests
FOR INSERT TO authenticated
WITH CHECK (
  staff_id = auth.uid()
  AND public.is_org_member(organization_id, auth.uid())
);

-- Staff can update their own request to add receipts/summary; admins/managers can update (e.g., approve/deny)
CREATE POLICY "Update reimbursement requests"
ON public.activity_reimbursement_requests
FOR UPDATE TO authenticated
USING (
  public.is_org_admin_or_manager(organization_id, auth.uid())
  OR staff_id = auth.uid()
)
WITH CHECK (
  public.is_org_admin_or_manager(organization_id, auth.uid())
  OR staff_id = auth.uid()
);

CREATE TRIGGER trg_arr_updated_at
BEFORE UPDATE ON public.activity_reimbursement_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for receipts (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-receipts', 'activity-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {organization_id}/{shift_id}/{request_id}/{filename}
CREATE POLICY "Org members read activity receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'activity-receipts'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Org members upload activity receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'activity-receipts'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

CREATE POLICY "Org members delete activity receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'activity-receipts'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid, auth.uid())
);
