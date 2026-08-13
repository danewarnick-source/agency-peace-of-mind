-- Widen notifications.type to allow the two new Company Obligations
-- notification kinds (reminders to assignees, and admin/manager updates on
-- completion or overdue). Purely additive — no existing rows are touched.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'incident_report_filed','incident_deadline_warning','timesheet_exception','daily_log_exception',
  'open_shift_warning','medication_error','form_assigned','form_reminder','form_due',
  'staff_mandate_missing','smart_import_flag','smart_import_provisional_cert',
  'smart_import_unverified_cert','smart_import_cert_expiring','smart_import_question',
  'shift_published','shift_updated','time_off_requested','time_off_decided',
  'company_obligation_reminder','company_obligation_update'
]));
