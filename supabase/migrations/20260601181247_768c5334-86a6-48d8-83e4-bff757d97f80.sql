
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.auditor_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  packet_id UUID NOT NULL REFERENCES public.audit_packets(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  message TEXT,
  share_all_items BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auditor_shares_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX idx_auditor_shares_org ON public.auditor_shares(organization_id);
CREATE INDEX idx_auditor_shares_packet ON public.auditor_shares(packet_id);
CREATE INDEX idx_auditor_shares_email_lower ON public.auditor_shares(lower(recipient_email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditor_shares TO authenticated;
GRANT ALL ON public.auditor_shares TO service_role;

ALTER TABLE public.auditor_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage auditor shares"
ON public.auditor_shares FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = auditor_shares.organization_id
    AND m.user_id = auth.uid() AND m.active = true
    AND m.role IN ('admin','manager','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = auditor_shares.organization_id
    AND m.user_id = auth.uid() AND m.active = true
    AND m.role IN ('admin','manager','super_admin')));

CREATE POLICY "Auditor can read own shares"
ON public.auditor_shares FOR SELECT TO authenticated
USING (lower(recipient_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));


CREATE TABLE public.auditor_share_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES public.auditor_shares(id) ON DELETE CASCADE,
  packet_item_id UUID REFERENCES public.audit_packet_items(id) ON DELETE CASCADE,
  audit_file_id UUID REFERENCES public.audit_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auditor_share_items_target_check CHECK (
    (packet_item_id IS NOT NULL)::int + (audit_file_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_auditor_share_items_share ON public.auditor_share_items(share_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditor_share_items TO authenticated;
GRANT ALL ON public.auditor_share_items TO service_role;

ALTER TABLE public.auditor_share_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins manage share items"
ON public.auditor_share_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.auditor_shares s
  JOIN public.organization_members m ON m.organization_id = s.organization_id
  WHERE s.id = auditor_share_items.share_id
    AND m.user_id = auth.uid() AND m.active = true
    AND m.role IN ('admin','manager','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.auditor_shares s
  JOIN public.organization_members m ON m.organization_id = s.organization_id
  WHERE s.id = auditor_share_items.share_id
    AND m.user_id = auth.uid() AND m.active = true
    AND m.role IN ('admin','manager','super_admin')));

CREATE POLICY "Auditor can read items in own shares"
ON public.auditor_share_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.auditor_shares s
  WHERE s.id = auditor_share_items.share_id
    AND lower(s.recipient_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))));


CREATE TABLE public.auditor_share_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES public.auditor_shares(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  actor_email TEXT,
  actor_user_id UUID,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditor_share_log_share ON public.auditor_share_access_log(share_id);
CREATE INDEX idx_auditor_share_log_org ON public.auditor_share_access_log(organization_id);

GRANT SELECT, INSERT ON public.auditor_share_access_log TO authenticated;
GRANT ALL ON public.auditor_share_access_log TO service_role;

ALTER TABLE public.auditor_share_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read share access log"
ON public.auditor_share_access_log FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = auditor_share_access_log.organization_id
    AND m.user_id = auth.uid() AND m.active = true
    AND m.role IN ('admin','manager','super_admin')));

CREATE POLICY "Authenticated insert share access log"
ON public.auditor_share_access_log FOR INSERT TO authenticated
WITH CHECK (true);

CREATE TRIGGER trg_auditor_shares_updated
BEFORE UPDATE ON public.auditor_shares
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
