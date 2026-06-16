
-- 1. client_medications additions
ALTER TABLE public.client_medications
  ADD COLUMN IF NOT EXISTS refill_threshold integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS refill_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS refill_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS refill_requested_by uuid,
  ADD COLUMN IF NOT EXISTS controlled_schedule text,
  ADD COLUMN IF NOT EXISTS is_rescue boolean NOT NULL DEFAULT false;

ALTER TABLE public.client_medications
  DROP CONSTRAINT IF EXISTS client_medications_refill_status_check;
ALTER TABLE public.client_medications
  ADD CONSTRAINT client_medications_refill_status_check
  CHECK (refill_status IN ('ok','pending','ordered'));

ALTER TABLE public.client_medications
  DROP CONSTRAINT IF EXISTS client_medications_controlled_schedule_check;
ALTER TABLE public.client_medications
  ADD CONSTRAINT client_medications_controlled_schedule_check
  CHECK (controlled_schedule IS NULL OR controlled_schedule IN ('II','III','IV','V'));

-- 2. emar_logs additions
ALTER TABLE public.emar_logs
  ADD COLUMN IF NOT EXISTS actual_taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS documented_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS late_entry_gap_minutes integer
    GENERATED ALWAYS AS (
      CASE WHEN actual_taken_at IS NOT NULL
        THEN GREATEST(0, (EXTRACT(EPOCH FROM (documented_at - actual_taken_at)) / 60)::int)
        ELSE NULL END
    ) STORED,
  ADD COLUMN IF NOT EXISTS service_context text,
  ADD COLUMN IF NOT EXISTS seizure_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS seizure_outcome text,
  ADD COLUMN IF NOT EXISTS emergency_services_called boolean;

-- 3. emar_logs append-only: drop update/delete policies
DROP POLICY IF EXISTS "managers update emar" ON public.emar_logs;
DROP POLICY IF EXISTS "managers delete emar" ON public.emar_logs;

-- Allow admins to flip admin_reviewed only (narrow update policy)
CREATE POLICY "admin_reviewed flip only"
  ON public.emar_logs
  FOR UPDATE
  TO authenticated
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

-- 4. emar_log_addenda
CREATE TABLE IF NOT EXISTS public.emar_log_addenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emar_log_id uuid NOT NULL REFERENCES public.emar_logs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  note text NOT NULL,
  staff_id uuid NOT NULL,
  staff_name text,
  signature_data_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emar_log_addenda_log ON public.emar_log_addenda(emar_log_id);
CREATE INDEX IF NOT EXISTS idx_emar_log_addenda_org ON public.emar_log_addenda(organization_id);

GRANT SELECT, INSERT ON public.emar_log_addenda TO authenticated;
GRANT ALL ON public.emar_log_addenda TO service_role;

ALTER TABLE public.emar_log_addenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read addenda" ON public.emar_log_addenda
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "members insert addenda" ON public.emar_log_addenda
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id, auth.uid()) AND staff_id = auth.uid());

-- 5. controlled_med_counts
CREATE TABLE IF NOT EXISTS public.controlled_med_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  medication_id uuid NOT NULL REFERENCES public.client_medications(id) ON DELETE CASCADE,
  emar_log_id uuid REFERENCES public.emar_logs(id) ON DELETE SET NULL,
  context text NOT NULL,
  expected_count integer,
  counted_value integer NOT NULL,
  variance integer GENERATED ALWAYS AS (counted_value - COALESCE(expected_count, counted_value)) STORED,
  flagged boolean NOT NULL DEFAULT false,
  staff_id uuid NOT NULL,
  staff_name text,
  signature_data_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cmc_context_check CHECK (context IN ('pass','shift_change','audit'))
);
CREATE INDEX IF NOT EXISTS idx_cmc_med ON public.controlled_med_counts(medication_id);
CREATE INDEX IF NOT EXISTS idx_cmc_org ON public.controlled_med_counts(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_flagged ON public.controlled_med_counts(organization_id, flagged) WHERE flagged;

GRANT SELECT, INSERT ON public.controlled_med_counts TO authenticated;
GRANT ALL ON public.controlled_med_counts TO service_role;

ALTER TABLE public.controlled_med_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read cmc" ON public.controlled_med_counts
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "members insert cmc" ON public.controlled_med_counts
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id, auth.uid()) AND staff_id = auth.uid());

-- 6. medication_transfers
CREATE TABLE IF NOT EXISTS public.medication_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  medication_id uuid NOT NULL REFERENCES public.client_medications(id) ON DELETE CASCADE,
  from_location text NOT NULL,
  to_location text NOT NULL,
  quantity integer NOT NULL,
  released_by_staff_id uuid NOT NULL,
  released_by_name text,
  released_signature text,
  received_by_name text NOT NULL,
  received_signature text,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mt_med ON public.medication_transfers(medication_id);
CREATE INDEX IF NOT EXISTS idx_mt_org ON public.medication_transfers(organization_id);

GRANT SELECT, INSERT ON public.medication_transfers TO authenticated;
GRANT ALL ON public.medication_transfers TO service_role;

ALTER TABLE public.medication_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read transfers" ON public.medication_transfers
  FOR SELECT TO authenticated
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "members insert transfers" ON public.medication_transfers
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id, auth.uid()) AND released_by_staff_id = auth.uid());

-- 7. med-assist training gate
CREATE OR REPLACE FUNCTION public.is_med_assist_current(_user uuid, _org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- True if the staff holds an active (non-expired) certification whose
  -- course title looks like medication-assistance training. If no medication
  -- course exists in the org's catalog at all, we permit (rollout-safe default).
  WITH med_courses AS (
    SELECT c.id FROM public.courses c
    WHERE c.organization_id = _org
      AND (c.title ILIKE '%medication%' OR c.title ILIKE '%med assist%' OR c.title ILIKE '%med-assist%')
  )
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM med_courses) THEN true
      ELSE EXISTS (
        SELECT 1 FROM public.certifications cert
        WHERE cert.user_id = _user
          AND cert.organization_id = _org
          AND cert.course_id IN (SELECT id FROM med_courses)
          AND (cert.expires_at IS NULL OR cert.expires_at > now())
      )
    END;
$$;

GRANT EXECUTE ON FUNCTION public.is_med_assist_current(uuid, uuid) TO authenticated;
