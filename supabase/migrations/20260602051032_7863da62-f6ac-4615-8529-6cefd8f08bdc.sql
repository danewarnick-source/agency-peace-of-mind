
-- Three-party approval chain for NECTAR-drafted requirements
-- (NECTAR drafts → HIVE Exec approves extraction → Provider confirms applicability)

-- 1) Flag on the source document marking it as HIVE-assisted intake.
ALTER TABLE public.nectar_documents
  ADD COLUMN IF NOT EXISTS assisted_setup_requested boolean NOT NULL DEFAULT false;

-- 2) Approval state on each requirement.
--    NULL = legacy / self-serve path (uses review_status as today).
--    Set  = assisted three-party chain.
ALTER TABLE public.nectar_requirements
  ADD COLUMN IF NOT EXISTS approval_state text;

ALTER TABLE public.nectar_requirements
  DROP CONSTRAINT IF EXISTS nectar_requirements_approval_state_chk;
ALTER TABLE public.nectar_requirements
  ADD CONSTRAINT nectar_requirements_approval_state_chk
  CHECK (approval_state IS NULL OR approval_state IN (
    'nectar_drafted',
    'hive_exec_approved',
    'hive_exec_rejected',
    'provider_confirmed',
    'provider_rejected'
  ));

CREATE INDEX IF NOT EXISTS idx_nectar_requirements_approval_state
  ON public.nectar_requirements (organization_id, approval_state);

-- 3) Append-only event log for the chain.
CREATE TABLE IF NOT EXISTS public.nectar_requirement_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  requirement_id uuid NOT NULL REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('nectar','hive_exec','provider')),
  action text NOT NULL CHECK (action IN ('drafted','approved','rejected','confirmed','reopened')),
  actor_user_id uuid,
  actor_label text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.nectar_requirement_approval_events TO authenticated;
GRANT ALL ON public.nectar_requirement_approval_events TO service_role;

ALTER TABLE public.nectar_requirement_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read approval events"
  ON public.nectar_requirement_approval_events FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.is_hive_executive(auth.uid())
  );

-- Inserts go through server functions using service_role; block direct inserts.
CREATE POLICY "no direct inserts approval events"
  ON public.nectar_requirement_approval_events FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_req_approval_events_req
  ON public.nectar_requirement_approval_events (requirement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_req_approval_events_org
  ON public.nectar_requirement_approval_events (organization_id, created_at DESC);

-- Block updates and deletes (append-only).
CREATE OR REPLACE FUNCTION public.nectar_requirement_approval_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'nectar_requirement_approval_events is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_req_approval_events_no_update ON public.nectar_requirement_approval_events;
CREATE TRIGGER trg_req_approval_events_no_update
  BEFORE UPDATE OR DELETE ON public.nectar_requirement_approval_events
  FOR EACH ROW EXECUTE FUNCTION public.nectar_requirement_approval_events_immutable();

-- 4) Allow HIVE Executives to update nectar_requirements rows for any org
--    (needed so they can transition approval_state during review).
CREATE POLICY "HIVE execs can update requirements"
  ON public.nectar_requirements FOR UPDATE
  TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE POLICY "HIVE execs can view requirements"
  ON public.nectar_requirements FOR SELECT
  TO authenticated
  USING (public.is_hive_executive(auth.uid()));
