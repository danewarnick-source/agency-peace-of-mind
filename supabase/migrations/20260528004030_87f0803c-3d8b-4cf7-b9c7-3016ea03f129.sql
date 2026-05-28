-- Blueprint 02: Notifications + Incident Reports Infrastructure

-- 1. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  recipient_role   TEXT NOT NULL DEFAULT 'admin'
                   CHECK (recipient_role IN ('admin','manager','super_admin')),
  type             TEXT NOT NULL
                   CHECK (type IN (
                     'incident_report_filed',
                     'incident_deadline_warning',
                     'timesheet_exception',
                     'daily_log_exception',
                     'open_shift_warning'
                   )),
  urgency          TEXT NOT NULL DEFAULT 'normal'
                   CHECK (urgency IN ('normal','urgent','critical')),
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  link_to          TEXT,
  related_id       UUID,
  related_type     TEXT,
  read_at          TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE INDEX IF NOT EXISTS idx_notifications_org_unread
  ON public.notifications (organization_id, recipient_role, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_related
  ON public.notifications (related_id, related_type);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read org notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    is_org_member(organization_id, auth.uid())
    AND (
      has_org_role(organization_id, auth.uid(), 'admin')
      OR has_org_role(organization_id, auth.uid(), 'manager')
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "service role insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins update own org notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    is_org_member(organization_id, auth.uid())
    AND (
      has_org_role(organization_id, auth.uid(), 'admin')
      OR has_org_role(organization_id, auth.uid(), 'manager')
      OR is_super_admin(auth.uid())
    )
  );

-- 2. Incident reports table
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID NOT NULL,
  client_id                  UUID NOT NULL,
  reported_by                UUID NOT NULL,
  triggered_by_note_id       UUID,
  triggered_by_note_type     TEXT CHECK (triggered_by_note_type IN ('evv_timesheet','daily_log')),
  report_number              TEXT NOT NULL,
  incident_date              DATE NOT NULL,
  incident_time              TIME NOT NULL,
  filed_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reporter_title             TEXT,
  incident_address           TEXT,
  incident_city              TEXT,
  incident_state             TEXT DEFAULT 'UT',
  incident_zip               TEXT,
  location_type              TEXT,
  location_detail            TEXT,
  additional_client_ids      UUID[],
  staff_involved             JSONB DEFAULT '[]',
  other_individuals          JSONB DEFAULT '[]',
  witnesses                  JSONB DEFAULT '[]',
  narrative_before           TEXT NOT NULL DEFAULT '',
  narrative_during           TEXT NOT NULL DEFAULT '',
  narrative_after            TEXT NOT NULL DEFAULT '',
  immediate_actions          TEXT NOT NULL DEFAULT '',
  incident_types             TEXT[] NOT NULL DEFAULT '{}',
  medical_attention_required BOOLEAN DEFAULT false,
  medical_response_type      TEXT,
  medical_facility           TEXT,
  medical_outcome            TEXT,
  supervisor_notified        BOOLEAN DEFAULT false,
  supervisor_name            TEXT,
  supervisor_notified_at     TIMESTAMPTZ,
  family_notified            BOOLEAN DEFAULT false,
  family_name                TEXT,
  family_notified_at         TIMESTAMPTZ,
  law_enforcement_called     BOOLEAN DEFAULT false,
  aps_notified               BOOLEAN DEFAULT false,
  staff_signature_url        TEXT,
  submitted_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                     TEXT NOT NULL DEFAULT 'Pending_Admin_Review'
                             CHECK (status IN (
                               'Pending_Admin_Review',
                               'Submitted_To_State',
                               'State_Confirmed',
                               'Requires_Amendment'
                             )),
  state_submission_deadline  TIMESTAMPTZ,
  state_submitted_at         TIMESTAMPTZ,
  state_submitted_by         UUID,
  state_confirmation_number  TEXT,
  amendment_reason           TEXT,
  ai_trigger_reasons         TEXT[] DEFAULT '{}',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_reports TO authenticated;
GRANT ALL ON public.incident_reports TO service_role;

-- Trigger to set state_submission_deadline = submitted_at + 24h
-- (replaces a GENERATED column because timestamptz + interval is not IMMUTABLE)
CREATE OR REPLACE FUNCTION public.set_incident_state_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.state_submission_deadline := NEW.submitted_at + interval '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS incident_reports_set_deadline ON public.incident_reports;
CREATE TRIGGER incident_reports_set_deadline
  BEFORE INSERT OR UPDATE OF submitted_at ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_incident_state_deadline();

CREATE SEQUENCE IF NOT EXISTS public.incident_report_seq START 1;

CREATE INDEX IF NOT EXISTS idx_incident_reports_org_status
  ON public.incident_reports (organization_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_reports_deadline
  ON public.incident_reports (state_submission_deadline)
  WHERE status = 'Pending_Admin_Review';

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read incident reports"
  ON public.incident_reports FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "staff insert incident reports"
  ON public.incident_reports FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid() AND is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins update incident reports"
  ON public.incident_reports FOR UPDATE TO authenticated
  USING (
    reported_by = auth.uid()
    OR is_org_admin_or_manager(organization_id, auth.uid())
    OR is_super_admin(auth.uid())
  );

DROP TRIGGER IF EXISTS incident_reports_touch ON public.incident_reports;
CREATE TRIGGER incident_reports_touch
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Missing columns on daily_logs for AI coach + approval workflow
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS ai_compliance_status    TEXT,
  ADD COLUMN IF NOT EXISTS ai_compliance_feedback  TEXT,
  ADD COLUMN IF NOT EXISTS ai_coaching_iterations  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS denial_reason           TEXT,
  ADD COLUMN IF NOT EXISTS denied_by               UUID,
  ADD COLUMN IF NOT EXISTS denied_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS word_count              INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_late          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_submission_reason  TEXT,
  ADD COLUMN IF NOT EXISTS backdated               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_due_date       DATE,
  ADD COLUMN IF NOT EXISTS requires_followup_form  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_form_types     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_trigger_reasons      TEXT[] DEFAULT '{}';

-- 4. Missing columns on evv_timesheets for late/backdated tracking
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS submitted_late          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_submission_reason  TEXT,
  ADD COLUMN IF NOT EXISTS requires_followup_form  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_form_types     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_trigger_reasons      TEXT[] DEFAULT '{}';

-- 5. notify_incident_filed helper function
CREATE OR REPLACE FUNCTION public.notify_incident_filed(
  p_organization_id  UUID,
  p_incident_id      UUID,
  p_client_name      TEXT,
  p_reporter_name    TEXT,
  p_deadline         TIMESTAMPTZ
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    organization_id, recipient_role, type, urgency,
    title, body, link_to, related_id, related_type
  ) VALUES (
    p_organization_id, 'admin', 'incident_report_filed', 'critical',
    '🚨 Incident Report Filed — Action Required',
    'Client: ' || p_client_name || ' · Reported by: ' || p_reporter_name ||
    ' · Must be submitted to state database by ' ||
    to_char(p_deadline AT TIME ZONE 'America/Denver', 'Mon DD at HH12:MI AM TZ'),
    '/dashboard/command-center',
    p_incident_id,
    'incident_report'
  );
END;
$$;

-- 6. Index on evv_gps_consent_status (was missing — fixes EvvConsentGate perf)
CREATE INDEX IF NOT EXISTS idx_profiles_evv_consent_status
  ON public.profiles (evv_gps_consent_status);

-- 7. touch_updated_at trigger on hhs_daily_records (was missing)
DROP TRIGGER IF EXISTS hhs_daily_records_touch ON public.hhs_daily_records;
CREATE TRIGGER hhs_daily_records_touch
  BEFORE UPDATE ON public.hhs_daily_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. CHECK constraint on hhs_monthly_attendance.away_category
ALTER TABLE public.hhs_monthly_attendance
  DROP CONSTRAINT IF EXISTS hhs_attendance_away_category_chk;
ALTER TABLE public.hhs_monthly_attendance
  ADD CONSTRAINT hhs_attendance_away_category_chk
  CHECK (
    away_category IS NULL OR
    away_category IN ('Hospitalization', 'Family Leave', 'Unapproved Absence')
  );