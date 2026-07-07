
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL;

ALTER TABLE public.evv_timesheets DROP CONSTRAINT IF EXISTS evv_timesheets_shift_entry_type_check;
ALTER TABLE public.evv_timesheets ADD CONSTRAINT evv_timesheets_shift_entry_type_check
  CHECK (shift_entry_type = ANY (ARRAY[
    'Client_Profile_Pass'::text,
    'General_Sidebar_Unscheduled'::text,
    'Day_Program_Attendance'::text,
    'Historical_Import'::text
  ]));

ALTER TABLE public.evv_timesheets DROP CONSTRAINT IF EXISTS evv_timesheets_import_source_check;
ALTER TABLE public.evv_timesheets ADD CONSTRAINT evv_timesheets_import_source_check
  CHECK (import_source IS NULL OR import_source = ANY (ARRAY['historical_import'::text]));

CREATE INDEX IF NOT EXISTS idx_evv_timesheets_org_import_source
  ON public.evv_timesheets (organization_id, import_source)
  WHERE import_source IS NOT NULL;

ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS import_jobs_mode_check;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_mode_check
  CHECK (mode = ANY (ARRAY['employee'::text, 'client'::text, 'timesheets'::text]));
