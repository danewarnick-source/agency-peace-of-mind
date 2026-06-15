-- Day Program Session model (DSG / DSP / DSI / SED) + MTP transport.
-- Per-client per-day billing decoupled from staff hours. SOW DHHS91172
-- Art. 7, 9, 13 (eff. 7/1/26).

-- ─── sessions ─────────────────────────────────────────────────────────────
CREATE TABLE public.day_program_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  location_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  location_label TEXT,
  service_code TEXT NOT NULL CHECK (service_code IN ('DSG','DSP','DSI','SED')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX idx_dps_org_date ON public.day_program_sessions(organization_id, session_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_program_sessions TO authenticated;
GRANT ALL ON public.day_program_sessions TO service_role;
ALTER TABLE public.day_program_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read sessions"
  ON public.day_program_sessions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Admins/managers write sessions"
  ON public.day_program_sessions FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin_or_manager(auth.uid(), organization_id));

-- ─── attendance (per-client per-session) ──────────────────────────────────
CREATE TABLE public.day_program_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.day_program_sessions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  attended BOOLEAN NOT NULL DEFAULT false,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  activity_note TEXT,
  billed_code TEXT CHECK (billed_code IN ('DSG','DSP','DSI','SED')),
  billed_mode TEXT CHECK (billed_mode IN ('daily','qtr_hr')),
  billed_units NUMERIC(10,2),
  billed_rate NUMERIC(10,2),
  cap_snapshot NUMERIC(10,2),
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, client_id),
  CHECK (departure_time IS NULL OR arrival_time IS NULL OR departure_time > arrival_time)
);
CREATE INDEX idx_dpa_client ON public.day_program_attendance(client_id);
CREATE INDEX idx_dpa_session ON public.day_program_attendance(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_program_attendance TO authenticated;
GRANT ALL ON public.day_program_attendance TO service_role;
ALTER TABLE public.day_program_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read attendance"
  ON public.day_program_attendance FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.day_program_sessions s
                 WHERE s.id = session_id AND public.is_org_member(auth.uid(), s.organization_id)));
CREATE POLICY "Admins/managers write attendance"
  ON public.day_program_attendance FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.day_program_sessions s
                 WHERE s.id = session_id AND public.is_org_admin_or_manager(auth.uid(), s.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.day_program_sessions s
                      WHERE s.id = session_id AND public.is_org_admin_or_manager(auth.uid(), s.organization_id)));

-- ─── session staff (labor only — NEVER drives billing) ────────────────────
CREATE TABLE public.day_program_session_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.day_program_sessions(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, staff_id)
);
CREATE INDEX idx_dpss_session ON public.day_program_session_staff(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_program_session_staff TO authenticated;
GRANT ALL ON public.day_program_session_staff TO service_role;
ALTER TABLE public.day_program_session_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read session staff"
  ON public.day_program_session_staff FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.day_program_sessions s
                 WHERE s.id = session_id AND public.is_org_member(auth.uid(), s.organization_id)));
CREATE POLICY "Admins/managers write session staff"
  ON public.day_program_session_staff FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.day_program_sessions s
                 WHERE s.id = session_id AND public.is_org_admin_or_manager(auth.uid(), s.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.day_program_sessions s
                      WHERE s.id = session_id AND public.is_org_admin_or_manager(auth.uid(), s.organization_id)));

-- ─── transport block (optional per attendance row) ────────────────────────
CREATE TABLE public.day_program_transport (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL UNIQUE REFERENCES public.day_program_attendance(id) ON DELETE CASCADE,
  pickup_location TEXT,
  pickup_time TIMESTAMPTZ,
  dropoff_location TEXT,
  dropoff_time TIMESTAMPTZ,
  transport_staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mtp_billed BOOLEAN NOT NULL DEFAULT false,
  mtp_block_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.day_program_transport TO authenticated;
GRANT ALL ON public.day_program_transport TO service_role;
ALTER TABLE public.day_program_transport ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read transport"
  ON public.day_program_transport FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.day_program_attendance a
                 JOIN public.day_program_sessions s ON s.id = a.session_id
                 WHERE a.id = attendance_id AND public.is_org_member(auth.uid(), s.organization_id)));
CREATE POLICY "Admins/managers write transport"
  ON public.day_program_transport FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.day_program_attendance a
                 JOIN public.day_program_sessions s ON s.id = a.session_id
                 WHERE a.id = attendance_id AND public.is_org_admin_or_manager(auth.uid(), s.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.day_program_attendance a
                      JOIN public.day_program_sessions s ON s.id = a.session_id
                      WHERE a.id = attendance_id AND public.is_org_admin_or_manager(auth.uid(), s.organization_id)));

-- ─── updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER dps_set_updated_at BEFORE UPDATE ON public.day_program_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER dpa_set_updated_at BEFORE UPDATE ON public.day_program_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER dpss_set_updated_at BEFORE UPDATE ON public.day_program_session_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER dpt_set_updated_at BEFORE UPDATE ON public.day_program_transport
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── cap-validation trigger on client_billing_codes (DSG/DSP/DSI) ─────────
CREATE OR REPLACE FUNCTION public.validate_day_program_rate_cap()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cap NUMERIC;
BEGIN
  IF NEW.service_code = 'DSG' THEN cap := 246.61;
  ELSIF NEW.service_code = 'DSP' THEN cap := 403.39; -- max across modes; UI narrows by mode
  ELSIF NEW.service_code = 'DSI' THEN cap := 174.35; -- 6h tier max
  ELSIF NEW.service_code = 'MTP' THEN
    RAISE EXCEPTION 'MTP bills at flat statewide rate ($21.13); no per-client authorization.';
  ELSE
    RETURN NEW;
  END IF;
  IF NEW.rate_per_unit IS NOT NULL AND NEW.rate_per_unit > cap THEN
    RAISE EXCEPTION 'Rate % exceeds fee-schedule cap of % for %', NEW.rate_per_unit, cap, NEW.service_code;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cbc_validate_day_program_rate_cap ON public.client_billing_codes;
CREATE TRIGGER cbc_validate_day_program_rate_cap
  BEFORE INSERT OR UPDATE ON public.client_billing_codes
  FOR EACH ROW EXECUTE FUNCTION public.validate_day_program_rate_cap();

-- ─── billable view (single source for billing UI) ─────────────────────────
-- Computes per-client per-day day-program billable units + dollars and
-- enforces the MTP firewall (SOW 13.4(3)): MTP is billable only when a
-- DSG/DSP/SED attendance unit exists for the same client + date.
CREATE OR REPLACE VIEW public.day_program_billable_v
WITH (security_invoker = true)
AS
WITH attended AS (
  SELECT
    s.organization_id,
    s.session_date,
    s.service_code AS session_code,
    s.start_time, s.end_time,
    a.id AS attendance_id,
    a.session_id,
    a.client_id,
    a.attended,
    a.arrival_time, a.departure_time,
    a.billed_code, a.billed_mode, a.billed_units, a.billed_rate, a.cap_snapshot,
    a.activity_note
  FROM public.day_program_attendance a
  JOIN public.day_program_sessions s ON s.id = a.session_id
  WHERE a.attended = true
)
SELECT
  attendance_id,
  organization_id,
  session_date,
  client_id,
  COALESCE(billed_code, session_code) AS service_code,
  billed_mode,
  billed_units,
  billed_rate,
  cap_snapshot,
  (COALESCE(billed_units,0) * COALESCE(billed_rate,0))::numeric(12,2) AS dollars,
  activity_note,
  session_id,
  'attendance'::text AS row_kind
FROM attended
UNION ALL
SELECT
  t.id AS attendance_id,
  s.organization_id,
  s.session_date,
  a.client_id,
  'MTP'::text AS service_code,
  'daily'::text AS billed_mode,
  CASE WHEN t.mtp_billed AND EXISTS (
    SELECT 1 FROM attended a2
    WHERE a2.client_id = a.client_id
      AND a2.session_date = s.session_date
      AND COALESCE(a2.billed_code, a2.session_code) IN ('DSG','DSP','SED')
  ) THEN 1 ELSE 0 END::numeric AS billed_units,
  21.13::numeric AS billed_rate,
  21.13::numeric AS cap_snapshot,
  (CASE WHEN t.mtp_billed AND EXISTS (
    SELECT 1 FROM attended a2
    WHERE a2.client_id = a.client_id
      AND a2.session_date = s.session_date
      AND COALESCE(a2.billed_code, a2.session_code) IN ('DSG','DSP','SED')
  ) THEN 21.13 ELSE 0 END)::numeric(12,2) AS dollars,
  t.mtp_block_reason AS activity_note,
  a.session_id,
  'transport'::text AS row_kind
FROM public.day_program_transport t
JOIN public.day_program_attendance a ON a.id = t.attendance_id
JOIN public.day_program_sessions s ON s.id = a.session_id;

GRANT SELECT ON public.day_program_billable_v TO authenticated;
GRANT SELECT ON public.day_program_billable_v TO service_role;