
-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read clients" ON public.clients FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "managers write clients" ON public.clients FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Shift status enum
DO $$ BEGIN
  CREATE TYPE public.shift_status AS ENUM ('pending', 'approved', 'rejected', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shifts
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  clock_in_time TIMESTAMPTZ,
  clock_out_time TIMESTAMPTZ,
  clock_in_lat NUMERIC,
  clock_in_long NUMERIC,
  clock_out_lat NUMERIC,
  clock_out_long NUMERIC,
  outside_geofence BOOLEAN NOT NULL DEFAULT false,
  device_fingerprint TEXT,
  status public.shift_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shifts_org ON public.shifts(organization_id);
CREATE INDEX idx_shifts_user ON public.shifts(user_id);
CREATE INDEX idx_shifts_client ON public.shifts(client_id);

CREATE POLICY "users read own shifts or managers org" ON public.shifts FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid()));
CREATE POLICY "users insert own shifts" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id, auth.uid()));
CREATE POLICY "users update own or managers" ON public.shifts FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers delete shifts" ON public.shifts FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- Shift notes
CREATE TABLE public.shift_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  narrative_summary TEXT,
  goals_addressed TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shift_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shift_notes_shift ON public.shift_notes(shift_id);

CREATE POLICY "read shift notes via shift" ON public.shift_notes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = shift_notes.shift_id
      AND (s.user_id = auth.uid()
        OR public.is_org_admin_or_manager(s.organization_id, auth.uid())
        OR public.is_super_admin(auth.uid()))
  ));
CREATE POLICY "users insert own shift notes" ON public.shift_notes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own or managers shift notes" ON public.shift_notes FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.shifts s WHERE s.id = shift_notes.shift_id
      AND public.is_org_admin_or_manager(s.organization_id, auth.uid())
  ))
  WITH CHECK (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.shifts s WHERE s.id = shift_notes.shift_id
      AND public.is_org_admin_or_manager(s.organization_id, auth.uid())
  ));
CREATE POLICY "managers delete shift notes" ON public.shift_notes FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shifts s WHERE s.id = shift_notes.shift_id
      AND public.is_org_admin_or_manager(s.organization_id, auth.uid())
  ));
