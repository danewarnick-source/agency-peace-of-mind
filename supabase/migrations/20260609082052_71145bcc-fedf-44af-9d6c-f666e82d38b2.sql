
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recurrence_key TEXT,
  ADD COLUMN IF NOT EXISTS next_remind_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS recurrence_interval INTERVAL DEFAULT '7 days';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'incident_report_filed','incident_deadline_warning','timesheet_exception',
    'daily_log_exception','open_shift_warning','medication_error',
    'form_assigned','form_reminder','form_due','staff_mandate_missing',
    'smart_import_flag','smart_import_provisional_cert','smart_import_unverified_cert',
    'smart_import_cert_expiring','smart_import_question'
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_recurrence_unique
  ON public.notifications (organization_id, recurrence_key)
  WHERE recurrence_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_open_remind
  ON public.notifications (organization_id, next_remind_at)
  WHERE resolved_at IS NULL AND recurrence_key IS NOT NULL;
