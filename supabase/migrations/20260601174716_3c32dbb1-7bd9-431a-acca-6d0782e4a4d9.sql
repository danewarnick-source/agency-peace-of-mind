
-- Audit packets (one folder per audit cycle)
CREATE TABLE public.audit_packets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  fiscal_year TEXT NOT NULL,            -- e.g. 'FY26'
  provider_name TEXT NOT NULL,
  name TEXT NOT NULL,                   -- e.g. 'FY26 — True North Supports'
  timeline_start DATE,
  timeline_end DATE,
  expectations_summary TEXT,            -- AI-extracted summary of letter
  audit_letter_path TEXT,               -- storage path in audit-documents
  audit_letter_text TEXT,               -- parsed text of the letter
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','compiled','submitted','closed')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_packets TO authenticated;
GRANT ALL ON public.audit_packets TO service_role;

ALTER TABLE public.audit_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view audit packets"
  ON public.audit_packets FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Admins insert audit packets"
  ON public.audit_packets FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "Admins update audit packets"
  ON public.audit_packets FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "Admins delete audit packets"
  ON public.audit_packets FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_audit_packets_updated_at
  BEFORE UPDATE ON public.audit_packets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Items required by the audit letter
CREATE TABLE public.audit_packet_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  packet_id UUID NOT NULL REFERENCES public.audit_packets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  sub_folder TEXT NOT NULL CHECK (sub_folder IN ('staff','client','admin','other')),
  title TEXT NOT NULL,
  description TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('auto_filled','needs_review','missing','confirmed','not_applicable')),
  source_hint TEXT,           -- e.g. 'evv_timesheets', 'certifications'
  evidence_count INTEGER NOT NULL DEFAULT 0,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_packet_items TO authenticated;
GRANT ALL ON public.audit_packet_items TO service_role;

ALTER TABLE public.audit_packet_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view audit items"
  ON public.audit_packet_items FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "Admins manage audit items"
  ON public.audit_packet_items FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER trg_audit_packet_items_updated_at
  BEFORE UPDATE ON public.audit_packet_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_audit_packet_items_packet ON public.audit_packet_items(packet_id);
CREATE INDEX idx_audit_packets_org ON public.audit_packets(organization_id, created_at DESC);

-- Link Records-Desk monthly audit files to a packet
ALTER TABLE public.audit_files
  ADD COLUMN IF NOT EXISTS audit_packet_id UUID REFERENCES public.audit_packets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_files_packet ON public.audit_files(audit_packet_id);
