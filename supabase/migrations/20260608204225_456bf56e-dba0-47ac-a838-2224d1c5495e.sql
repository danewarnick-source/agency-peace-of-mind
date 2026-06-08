ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'incident_report_filed'::text,
  'incident_deadline_warning'::text,
  'timesheet_exception'::text,
  'daily_log_exception'::text,
  'open_shift_warning'::text,
  'medication_error'::text,
  'form_assigned'::text,
  'form_reminder'::text,
  'form_due'::text,
  'staff_mandate_missing'::text
]));