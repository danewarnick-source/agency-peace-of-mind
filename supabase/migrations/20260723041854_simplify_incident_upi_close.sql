-- Simplify §1.27 incident closing: one signed "Submit to UPI" action replaces
-- separate UPI-initiated / UPI-completed / guardian-notification / SC-update
-- attestations. See docs/SQL_HANDOFF.md for the human-run version of this.

ALTER TABLE public.incident_reports
  ADD COLUMN IF NOT EXISTS upi_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS upi_submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS upi_submitted_attestation_text text,
  ADD COLUMN IF NOT EXISTS upi_submitted_signed_name text,
  ADD COLUMN IF NOT EXISTS upi_submitted_signed_title text,
  ADD COLUMN IF NOT EXISTS guardian_notified_details text;

-- Legacy columns (upi_initiated_*, upi_completed_*, guardian_attestation_text,
-- guardian_signed_*, sc_update_*) are left in place — not backfilled, no
-- longer written by the app. incident_sc_requests is likewise left in place
-- but no longer read/written by the app; SC follow-up is now a plain
-- incident_reports.followup_notes field.
