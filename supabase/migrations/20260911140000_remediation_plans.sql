-- Additive remediation_plans + compliance_overrides (Compliance revamp Step 4).
-- Soft stamp lane lock: 20260911140000. Do not reuse 100000/101000/110000/120000/130000.
-- Org-scoped PHI/ops. Idempotent. Never drop tables.
-- Do NOT run against production from CI — Core Soft pastes this in Lovable
-- (clear the editor first). Soft HOLD until after Steps 3 / 5 / 8 Soft.
-- See docs/SQL_HANDOFF.md.

-- ── remediation_plans ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.remediation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  obligation_id uuid,
  instance_id uuid,
  staff_id uuid,
  obligation_key text,
  title text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_approval',
  plan_text text NOT NULL,
  due_at timestamptz,
  proposed_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  outcome text,
  outcome_note text,
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.remediation_plans
  ADD COLUMN IF NOT EXISTS obligation_id uuid,
  ADD COLUMN IF NOT EXISTS instance_id uuid,
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS obligation_key text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS plan_text text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_note text,
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.remediation_plans
  ALTER COLUMN title SET DEFAULT '',
  ALTER COLUMN kind SET DEFAULT 'solo_lapse',
  ALTER COLUMN status SET DEFAULT 'awaiting_approval',
  ALTER COLUMN plan_text SET DEFAULT '',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.remediation_plans
  DROP CONSTRAINT IF EXISTS remediation_plans_kind_chk;
ALTER TABLE public.remediation_plans
  ADD CONSTRAINT remediation_plans_kind_chk
  CHECK (kind IN (
    'solo_lapse',
    'scheduled_while_lapsed',
    'overdue',
    'standing_missing',
    'license_risk'
  ));

ALTER TABLE public.remediation_plans
  DROP CONSTRAINT IF EXISTS remediation_plans_status_chk;
ALTER TABLE public.remediation_plans
  ADD CONSTRAINT remediation_plans_status_chk
  CHECK (status IN (
    'draft',
    'awaiting_approval',
    'approved',
    'rejected',
    'completed',
    'expired'
  ));

ALTER TABLE public.remediation_plans
  DROP CONSTRAINT IF EXISTS remediation_plans_outcome_chk;
ALTER TABLE public.remediation_plans
  ADD CONSTRAINT remediation_plans_outcome_chk
  CHECK (
    outcome IS NULL
    OR outcome IN ('approved', 'rejected', 'completed', 'expired', 'withdrawn')
  );

CREATE INDEX IF NOT EXISTS remediation_plans_org_status_idx
  ON public.remediation_plans (organization_id, status);

CREATE INDEX IF NOT EXISTS remediation_plans_org_staff_idx
  ON public.remediation_plans (organization_id, staff_id);

CREATE UNIQUE INDEX IF NOT EXISTS remediation_plans_open_instance_kind_uidx
  ON public.remediation_plans (organization_id, instance_id, kind)
  WHERE status IN ('draft', 'awaiting_approval') AND instance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS remediation_plans_open_ob_staff_kind_uidx
  ON public.remediation_plans (organization_id, obligation_id, staff_id, kind)
  WHERE status IN ('draft', 'awaiting_approval')
    AND instance_id IS NULL
    AND obligation_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.remediation_plans TO authenticated;
GRANT ALL ON public.remediation_plans TO service_role;

ALTER TABLE public.remediation_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS remediation_plans_select_member ON public.remediation_plans;
CREATE POLICY remediation_plans_select_member
  ON public.remediation_plans
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

DROP POLICY IF EXISTS remediation_plans_write_manager ON public.remediation_plans;
CREATE POLICY remediation_plans_write_manager
  ON public.remediation_plans
  FOR ALL
  TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

-- ── compliance_overrides (recreate if missing; additive columns if leftover) ─

CREATE TABLE IF NOT EXISTS public.compliance_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  gap_type text NOT NULL,
  gap_reference_date date NOT NULL,
  gap_key text NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_overrides
  ADD COLUMN IF NOT EXISTS obligation_id uuid,
  ADD COLUMN IF NOT EXISTS instance_id uuid,
  ADD COLUMN IF NOT EXISTS obligation_key text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS shift_id uuid,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS gap_type text,
  ADD COLUMN IF NOT EXISTS gap_reference_date date,
  ADD COLUMN IF NOT EXISTS gap_key text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.compliance_overrides
  ALTER COLUMN gap_type SET DEFAULT 'solo_lapse',
  ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_overrides_org_staff
  ON public.compliance_overrides (organization_id, staff_id);

CREATE INDEX IF NOT EXISTS compliance_overrides_org_key_idx
  ON public.compliance_overrides (organization_id, obligation_key);

CREATE INDEX IF NOT EXISTS compliance_overrides_org_gap_idx
  ON public.compliance_overrides (organization_id, gap_key);

GRANT SELECT, INSERT, UPDATE ON public.compliance_overrides TO authenticated;
GRANT ALL ON public.compliance_overrides TO service_role;

ALTER TABLE public.compliance_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers manage overrides" ON public.compliance_overrides;
DROP POLICY IF EXISTS compliance_overrides_select_member ON public.compliance_overrides;
CREATE POLICY compliance_overrides_select_member
  ON public.compliance_overrides
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
    OR staff_id = auth.uid()
  );

DROP POLICY IF EXISTS compliance_overrides_write_manager ON public.compliance_overrides;
CREATE POLICY compliance_overrides_write_manager
  ON public.compliance_overrides
  FOR ALL
  TO authenticated
  USING (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  )
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  );
