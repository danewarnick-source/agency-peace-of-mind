
-- ─── billing_submissions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','locked')),
  attestation_text text,
  attestation_signature_name text,
  submitted_by uuid,
  submitted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_billing_submissions_org_period
  ON public.billing_submissions (organization_id, period_start DESC);

GRANT SELECT, INSERT, UPDATE ON public.billing_submissions TO authenticated;
GRANT ALL ON public.billing_submissions TO service_role;

ALTER TABLE public.billing_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view billing submissions"
  ON public.billing_submissions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can create billing submissions"
  ON public.billing_submissions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can update billing submissions"
  ON public.billing_submissions FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE TRIGGER billing_submissions_set_updated
  BEFORE UPDATE ON public.billing_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Prevent edits to a locked/submitted submission (only allow status forward transitions).
CREATE OR REPLACE FUNCTION public.billing_submissions_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('submitted','locked')
     AND NEW.status NOT IN ('submitted','locked') THEN
    RAISE EXCEPTION 'A submitted 520 cannot be reverted to draft.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_submissions_guard_trg
  BEFORE UPDATE ON public.billing_submissions
  FOR EACH ROW EXECUTE FUNCTION public.billing_submissions_guard();

-- ─── billing_submission_warnings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_submission_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.billing_submissions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  row_key text,
  warning_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','blocker')),
  message text NOT NULL,
  related_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dismissed','attested')),
  acted_by uuid,
  actor_name text,
  action_at timestamptz,
  action_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_warnings_submission
  ON public.billing_submission_warnings (submission_id, status);

GRANT SELECT, INSERT, UPDATE ON public.billing_submission_warnings TO authenticated;
GRANT ALL ON public.billing_submission_warnings TO service_role;

ALTER TABLE public.billing_submission_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view billing warnings"
  ON public.billing_submission_warnings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can insert billing warnings"
  ON public.billing_submission_warnings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins/managers can act on pending warnings"
  ON public.billing_submission_warnings FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) AND status = 'pending')
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- Lock acted warnings: once status leaves 'pending', it cannot change again,
-- and identifying fields are immutable.
CREATE OR REPLACE FUNCTION public.billing_warnings_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'This audit warning has already been actioned and is immutable.';
  END IF;
  IF NEW.submission_id <> OLD.submission_id
     OR NEW.warning_type <> OLD.warning_type
     OR NEW.message <> OLD.message
     OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'Audit warning identifying fields are immutable.';
  END IF;
  IF NEW.status NOT IN ('dismissed','attested') THEN
    RAISE EXCEPTION 'Warning status must transition to dismissed or attested.';
  END IF;
  NEW.action_at := COALESCE(NEW.action_at, now());
  NEW.acted_by := COALESCE(NEW.acted_by, auth.uid());
  RETURN NEW;
END;
$$;
CREATE TRIGGER billing_warnings_lock_trg
  BEFORE UPDATE ON public.billing_submission_warnings
  FOR EACH ROW EXECUTE FUNCTION public.billing_warnings_lock();

-- ─── billing_submission_audit_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_submission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.billing_submissions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  actor_user_id uuid,
  actor_name text,
  action text NOT NULL,
  item_type text,
  item_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_submission
  ON public.billing_submission_audit_log (submission_id, created_at);

-- Append-only: SELECT + INSERT, no UPDATE / DELETE for authenticated.
GRANT SELECT, INSERT ON public.billing_submission_audit_log TO authenticated;
GRANT ALL ON public.billing_submission_audit_log TO service_role;

ALTER TABLE public.billing_submission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view audit log"
  ON public.billing_submission_audit_log FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org members can append audit log entries"
  ON public.billing_submission_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id, auth.uid()) AND actor_user_id = auth.uid());

-- Defense in depth: block any UPDATE / DELETE at the trigger level too.
CREATE OR REPLACE FUNCTION public.billing_audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'billing_submission_audit_log is append-only.';
END;
$$;
CREATE TRIGGER billing_audit_log_no_update
  BEFORE UPDATE ON public.billing_submission_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.billing_audit_log_immutable();
CREATE TRIGGER billing_audit_log_no_delete
  BEFORE DELETE ON public.billing_submission_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.billing_audit_log_immutable();
