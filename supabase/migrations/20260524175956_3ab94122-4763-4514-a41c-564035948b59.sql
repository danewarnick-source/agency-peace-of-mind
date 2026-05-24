
CREATE TABLE public.client_medications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  route text,
  scheduled_times text[] NOT NULL DEFAULT '{}',
  instructions text,
  prescriber text,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  discontinued_at timestamptz,
  discontinued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_client_medications_client ON public.client_medications(client_id);
CREATE INDEX idx_client_medications_org ON public.client_medications(organization_id);
ALTER TABLE public.client_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read meds" ON public.client_medications FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "managers write meds" ON public.client_medications FOR ALL TO authenticated
USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.emar_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  medication_id uuid NOT NULL REFERENCES public.client_medications(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  scheduled_time_label text,
  administered_at timestamptz,
  status text NOT NULL CHECK (status IN ('administered','refused','omitted','missed')),
  exception_reason text,
  notes text,
  staff_id uuid,
  staff_name text,
  signature_attestation text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_emar_logs_client ON public.emar_logs(client_id);
CREATE INDEX idx_emar_logs_org ON public.emar_logs(organization_id);
CREATE INDEX idx_emar_logs_scheduled ON public.emar_logs(scheduled_for);
CREATE INDEX idx_emar_logs_med ON public.emar_logs(medication_id);
ALTER TABLE public.emar_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read emar" ON public.emar_logs FOR SELECT TO authenticated
USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "members insert emar" ON public.emar_logs FOR INSERT TO authenticated
WITH CHECK (public.is_org_member(organization_id, auth.uid()) AND staff_id = auth.uid());
CREATE POLICY "managers update emar" ON public.emar_logs FOR UPDATE TO authenticated
USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "managers delete emar" ON public.emar_logs FOR DELETE TO authenticated
USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
