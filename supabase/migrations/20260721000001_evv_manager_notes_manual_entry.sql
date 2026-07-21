-- Manager/admin notes + manual timesheet entry support for evv_timesheets.
-- See docs/SQL_HANDOFF.md #10 — this file must match what's run in Lovable's
-- SQL editor exactly; supabase/migrations/ does not auto-apply to the live
-- (Lovable Cloud) database.
ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS manager_note_text    text,
  ADD COLUMN IF NOT EXISTS manager_note_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_note_by_name text,
  ADD COLUMN IF NOT EXISTS manager_note_at      timestamptz;

ALTER TABLE public.evv_timesheets DROP CONSTRAINT IF EXISTS evv_timesheets_shift_entry_type_check;
ALTER TABLE public.evv_timesheets ADD CONSTRAINT evv_timesheets_shift_entry_type_check
  CHECK (shift_entry_type = ANY (ARRAY[
    'Client_Profile_Pass'::text,
    'General_Sidebar_Unscheduled'::text,
    'Day_Program_Attendance'::text,
    'Historical_Import'::text,
    'Manual_Entry'::text
  ]));

CREATE POLICY "admin insert evv for staff"
  ON public.evv_timesheets FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
