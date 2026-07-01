-- =========================================================================
-- HIVE Admin billing-code approval requests + threaded messages
-- =========================================================================

CREATE TABLE public.billing_code_approval_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requesting_user_id        uuid NOT NULL,
  import_job_id             uuid,
  subject_id                uuid,
  extracted_field_id        uuid,
  code                      text NOT NULL,
  provider_name_on_pcsp     text,
  justification             text NOT NULL CHECK (length(justification) >= 20),
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','denied','withdrawn')),
  resolved_by_user_id       uuid,
  resolved_at               timestamptz,
  resolution_note           text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_code_approval_requests_org_idx
  ON public.billing_code_approval_requests(organization_id, status, created_at DESC);
CREATE INDEX billing_code_approval_requests_field_idx
  ON public.billing_code_approval_requests(extracted_field_id);
CREATE INDEX billing_code_approval_requests_status_idx
  ON public.billing_code_approval_requests(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.billing_code_approval_requests TO authenticated;
GRANT ALL ON public.billing_code_approval_requests TO service_role;

ALTER TABLE public.billing_code_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider admins see own org requests"
  ON public.billing_code_approval_requests
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

CREATE POLICY "provider admins open requests for own org"
  ON public.billing_code_approval_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requesting_user_id = auth.uid()
    AND public.is_org_admin_or_manager(organization_id, auth.uid())
  );

CREATE POLICY "provider admins withdraw own pending requests"
  ON public.billing_code_approval_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

-- ------------------------------------------------------------------
-- Thread messages
-- ------------------------------------------------------------------
CREATE TABLE public.billing_code_approval_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES public.billing_code_approval_requests(id) ON DELETE CASCADE,
  sender_user_id        uuid NOT NULL,
  sender_role           text NOT NULL CHECK (sender_role IN ('provider','hive_admin')),
  body                  text NOT NULL CHECK (length(btrim(body)) >= 1),
  action                text CHECK (action IN ('approve','deny')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  read_by_provider_at   timestamptz,
  read_by_hive_at       timestamptz
);

CREATE INDEX billing_code_approval_messages_req_idx
  ON public.billing_code_approval_messages(request_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.billing_code_approval_messages TO authenticated;
GRANT ALL ON public.billing_code_approval_messages TO service_role;

ALTER TABLE public.billing_code_approval_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read messages"
  ON public.billing_code_approval_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_code_approval_requests r
      WHERE r.id = request_id
        AND (
          public.is_org_admin_or_manager(r.organization_id, auth.uid())
          OR public.is_hive_executive(auth.uid())
        )
    )
  );

CREATE POLICY "participants post messages"
  ON public.billing_code_approval_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.billing_code_approval_requests r
      WHERE r.id = request_id
        AND (
          (sender_role = 'provider'
             AND public.is_org_admin_or_manager(r.organization_id, auth.uid()))
          OR (sender_role = 'hive_admin'
             AND public.is_hive_executive(auth.uid()))
        )
    )
  );

CREATE POLICY "participants mark read"
  ON public.billing_code_approval_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_code_approval_requests r
      WHERE r.id = request_id
        AND (
          public.is_org_admin_or_manager(r.organization_id, auth.uid())
          OR public.is_hive_executive(auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.billing_code_approval_requests r
      WHERE r.id = request_id
        AND (
          public.is_org_admin_or_manager(r.organization_id, auth.uid())
          OR public.is_hive_executive(auth.uid())
        )
    )
  );

-- ------------------------------------------------------------------
-- Updated_at trigger for the requests table
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_billing_code_approval_requests()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER billing_code_approval_requests_touch
BEFORE UPDATE ON public.billing_code_approval_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_billing_code_approval_requests();