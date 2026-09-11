-- Additive escalation_rules catalog (Compliance revamp Step 2).
-- Hive-authored, read-only to orgs. Idempotent. No DROP.
-- Do NOT run against production from CI — Core Soft pastes this in Lovable
-- (clear the editor first). See docs/SQL_HANDOFF.md.

CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL,
  climbs_to text NOT NULL,
  urgency text NOT NULL,
  message_template text NOT NULL,
  state_code text NOT NULL DEFAULT 'UT',
  archived_at timestamptz
);

ALTER TABLE public.escalation_rules
  DROP CONSTRAINT IF EXISTS escalation_rules_trigger_chk;
ALTER TABLE public.escalation_rules
  ADD CONSTRAINT escalation_rules_trigger_chk
  CHECK (trigger IN (
    'half_window_not_started',
    'overdue',
    'would_create_finding_if_scheduled',
    'license_or_repayment_risk',
    'standing_record_missing_30d'
  ));

ALTER TABLE public.escalation_rules
  DROP CONSTRAINT IF EXISTS escalation_rules_climbs_to_chk;
ALTER TABLE public.escalation_rules
  ADD CONSTRAINT escalation_rules_climbs_to_chk
  CHECK (climbs_to IN ('manager', 'manager_of_manager', 'admin_level'));

ALTER TABLE public.escalation_rules
  DROP CONSTRAINT IF EXISTS escalation_rules_urgency_chk;
ALTER TABLE public.escalation_rules
  ADD CONSTRAINT escalation_rules_urgency_chk
  CHECK (urgency IN ('normal', 'high', 'critical'));

CREATE UNIQUE INDEX IF NOT EXISTS escalation_rules_state_trigger_uidx
  ON public.escalation_rules (state_code, trigger);

GRANT SELECT ON public.escalation_rules TO authenticated;
GRANT ALL ON public.escalation_rules TO service_role;

ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escalation_rules_select_authenticated ON public.escalation_rules;
CREATE POLICY escalation_rules_select_authenticated
  ON public.escalation_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS escalation_rules_write_hive ON public.escalation_rules;
CREATE POLICY escalation_rules_write_hive
  ON public.escalation_rules
  FOR ALL
  TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

INSERT INTO public.escalation_rules (trigger, climbs_to, urgency, message_template, state_code)
VALUES
  (
    'half_window_not_started',
    'manager',
    'normal',
    '{subject}: {title} not started, due {due}. {n_days} days left.',
    'UT'
  ),
  (
    'overdue',
    'manager_of_manager',
    'high',
    '{subject}: {title} is {days_overdue} days overdue.',
    'UT'
  ),
  (
    'would_create_finding_if_scheduled',
    'manager',
    'high',
    '{subject} is scheduled {n_shifts} shifts while {title} is lapsed. Each is a {audit_ref} finding.',
    'UT'
  ),
  (
    'license_or_repayment_risk',
    'admin_level',
    'critical',
    '{title} — {status}. This is a license/repayment item ({citation}).',
    'UT'
  ),
  (
    'standing_record_missing_30d',
    'admin_level',
    'high',
    '{title} has been missing for 30 days.',
    'UT'
  )
ON CONFLICT (state_code, trigger) DO UPDATE
SET
  climbs_to = EXCLUDED.climbs_to,
  urgency = EXCLUDED.urgency,
  message_template = EXCLUDED.message_template,
  archived_at = NULL;

-- Widen notifications.type so the nightly evaluator can insert type=escalation.
-- Additive: keep every existing allowed value, append escalation if missing.
DO $$
DECLARE
  def text;
  inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  IF def IS NOT NULL AND def ILIKE '%escalation%' THEN
    RETURN;
  END IF;

  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

  IF def IS NULL THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (type = ANY (ARRAY['escalation'::text]));
    RETURN;
  END IF;

  inner_expr := regexp_replace(def, '^CHECK\s*\(', '');
  inner_expr := left(inner_expr, length(inner_expr) - 1);

  IF inner_expr ~* 'ARRAY\[' THEN
    inner_expr := regexp_replace(inner_expr, '\]\s*$', ', ''escalation''::text]');
  ELSIF inner_expr ~* 'IN\s*\(' THEN
    inner_expr := regexp_replace(inner_expr, '\)\s*$', ', ''escalation'')');
  ELSE
    inner_expr := 'type = ANY (ARRAY[''escalation''::text])';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (%s)',
    inner_expr
  );
END $$;
