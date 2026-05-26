ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS is_edited_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_by_admin_name text,
  ADD COLUMN IF NOT EXISTS edit_audit_history_log jsonb NOT NULL DEFAULT '[]'::jsonb;