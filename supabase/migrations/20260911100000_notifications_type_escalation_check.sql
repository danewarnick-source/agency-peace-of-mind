-- Harden notifications.type CHECK so type=escalation is allowed.
-- Additive. Idempotent. No DROP of product tables.
--
-- Why a new file: 20260911090000_escalation_rules.sql already applied
-- (table + 5 seeds + RLS + indexes). Its DO/regexp used `]\s*$` and
-- missed the live form CHECK ((type = ANY (ARRAY[…]))) (trailing `]))`).
-- Do not rewrite that file. Hive-Platform was Soft-fixed live with
-- explicit 22 + escalation; this paste may no-op there.
--
-- Do NOT run against production from CI — Core Soft pastes this in
-- Lovable (clear the editor first). See docs/SQL_HANDOFF.md.

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  -- Idempotent: Hive-Platform Soft-fix or a prior apply already widened.
  IF def IS NOT NULL AND def ILIKE '%''escalation''%' THEN
    RETURN;
  END IF;

  ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

  -- Known-good allow-list: live Hive-Platform 22 types + escalation.
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY[
      'incident_report_filed'::text,
      'incident_deadline_warning'::text,
      'timesheet_exception'::text,
      'daily_log_exception'::text,
      'open_shift_warning'::text,
      'medication_error'::text,
      'form_assigned'::text,
      'form_reminder'::text,
      'form_due'::text,
      'staff_mandate_missing'::text,
      'smart_import_flag'::text,
      'smart_import_provisional_cert'::text,
      'smart_import_unverified_cert'::text,
      'smart_import_cert_expiring'::text,
      'smart_import_question'::text,
      'shift_published'::text,
      'shift_updated'::text,
      'time_off_requested'::text,
      'time_off_decided'::text,
      'company_obligation_reminder'::text,
      'company_obligation_update'::text,
      'hive_training_class'::text,
      'escalation'::text
    ]));
END $$;
