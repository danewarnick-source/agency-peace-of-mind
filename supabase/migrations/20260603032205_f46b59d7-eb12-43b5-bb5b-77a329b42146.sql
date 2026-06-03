-- Add the foreign keys that the Command Center's PostgREST embedded selects
-- depend on. Without these, queries that embed clients:client_id (...) or
-- profiles:reported_by (...) fail with HTTP 400 / PGRST200 ("Could not find
-- a relationship"). ON DELETE CASCADE matches the convention used by every
-- comparable table in this project (daily_logs, evv_timesheets, etc.).

ALTER TABLE public.incident_reports
  ADD CONSTRAINT incident_reports_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.incident_reports
  ADD CONSTRAINT incident_reports_reported_by_fkey
    FOREIGN KEY (reported_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.emar_logs
  ADD CONSTRAINT emar_logs_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;