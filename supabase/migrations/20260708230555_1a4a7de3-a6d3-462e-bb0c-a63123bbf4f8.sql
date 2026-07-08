
-- =====================================================
-- Maker-checker approval workflow for medication list changes
-- =====================================================

-- 1) Restrict direct writes on client_medications to ADMIN only
--    (managers previously had FOR ALL — that is exactly what we are removing).
DROP POLICY IF EXISTS "managers write meds" ON public.client_medications;

CREATE POLICY "admins write meds"
  ON public.client_medications
  FOR ALL
  TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  );

-- 2) Proposal table (maker-checker record)
CREATE TABLE public.medication_change_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  medication_id uuid REFERENCES public.client_medications(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('add','edit','discontinue')),
  proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','appointment_upload')),
  proposed_by uuid NOT NULL DEFAULT auth.uid(),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  applied_medication_id uuid REFERENCES public.client_medications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_med_proposals_client ON public.medication_change_proposals(client_id) WHERE status = 'pending';
CREATE INDEX idx_med_proposals_org_status ON public.medication_change_proposals(organization_id, status);

GRANT SELECT, INSERT, UPDATE ON public.medication_change_proposals TO authenticated;
GRANT ALL ON public.medication_change_proposals TO service_role;

ALTER TABLE public.medication_change_proposals ENABLE ROW LEVEL SECURITY;

-- Read: any org member can read (so managers see their own pending; admins see all)
CREATE POLICY "members read med proposals"
  ON public.medication_change_proposals
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

-- Insert: only admin OR manager. Direct support staff (employee, committee_member)
-- cannot even create a proposal. proposed_by must equal auth.uid().
CREATE POLICY "admin or manager insert med proposals"
  ON public.medication_change_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    proposed_by = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND applied_medication_id IS NULL
    AND (
      public.is_org_admin_or_manager(organization_id, auth.uid())
      OR public.is_super_admin(auth.uid())
    )
  );

-- Update: only ADMIN (approve/reject). Managers cannot approve their own proposals.
-- The apply-live path uses a SECURITY DEFINER RPC below and re-checks admin role.
CREATE POLICY "admin update med proposals"
  ON public.medication_change_proposals
  FOR UPDATE
  TO authenticated
  USING (
    public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.has_org_role(organization_id, auth.uid(), 'admin')
    OR public.is_super_admin(auth.uid())
  );

-- Keep updated_at fresh
CREATE TRIGGER trg_med_proposals_touch
  BEFORE UPDATE ON public.medication_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Apply/reject RPCs (SECURITY DEFINER, re-check admin role — fail closed)
CREATE OR REPLACE FUNCTION public.apply_med_change_proposal(_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.medication_change_proposals%ROWTYPE;
  new_med_id uuid;
  pl jsonb;
BEGIN
  SELECT * INTO p FROM public.medication_change_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  IF NOT (public.has_org_role(p.organization_id, auth.uid(), 'admin')
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only an organization admin can approve medication changes';
  END IF;

  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal is not pending (status=%)', p.status;
  END IF;

  pl := COALESCE(p.proposed_payload, '{}'::jsonb);

  IF p.change_type = 'add' THEN
    INSERT INTO public.client_medications (
      organization_id, client_id, medication_name, dosage, frequency, route,
      scheduled_times, instructions, prescriber, purpose, adverse_effects,
      choking_risk, choking_risk_details, is_controlled, is_prn, prn_instructions,
      pharmacy, rx_number, packaging, side_effects,
      contributes_to_swallowing_difficulty, created_by
    ) VALUES (
      p.organization_id, p.client_id,
      COALESCE(pl->>'medication_name',''),
      NULLIF(pl->>'dosage',''), NULLIF(pl->>'frequency',''), NULLIF(pl->>'route',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(pl->'scheduled_times','[]'::jsonb))), '{}'::text[]),
      NULLIF(pl->>'instructions',''), NULLIF(pl->>'prescriber',''),
      NULLIF(pl->>'purpose',''), NULLIF(pl->>'adverse_effects',''),
      COALESCE((pl->>'choking_risk')::boolean, false),
      NULLIF(pl->>'choking_risk_details',''),
      COALESCE((pl->>'is_controlled')::boolean, false),
      COALESCE((pl->>'is_prn')::boolean, false),
      NULLIF(pl->>'prn_instructions',''),
      NULLIF(pl->>'pharmacy',''), NULLIF(pl->>'rx_number',''),
      NULLIF(pl->>'packaging',''), NULLIF(pl->>'side_effects',''),
      COALESCE((pl->>'contributes_to_swallowing_difficulty')::boolean, false),
      auth.uid()
    ) RETURNING id INTO new_med_id;

  ELSIF p.change_type = 'edit' THEN
    IF p.medication_id IS NULL THEN RAISE EXCEPTION 'edit proposal missing medication_id'; END IF;
    UPDATE public.client_medications SET
      medication_name = COALESCE(NULLIF(pl->>'medication_name',''), medication_name),
      dosage = CASE WHEN pl ? 'dosage' THEN NULLIF(pl->>'dosage','') ELSE dosage END,
      frequency = CASE WHEN pl ? 'frequency' THEN NULLIF(pl->>'frequency','') ELSE frequency END,
      route = CASE WHEN pl ? 'route' THEN NULLIF(pl->>'route','') ELSE route END,
      scheduled_times = CASE WHEN pl ? 'scheduled_times'
        THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(pl->'scheduled_times')), '{}'::text[])
        ELSE scheduled_times END,
      instructions = CASE WHEN pl ? 'instructions' THEN NULLIF(pl->>'instructions','') ELSE instructions END,
      prescriber = CASE WHEN pl ? 'prescriber' THEN NULLIF(pl->>'prescriber','') ELSE prescriber END,
      purpose = CASE WHEN pl ? 'purpose' THEN NULLIF(pl->>'purpose','') ELSE purpose END,
      adverse_effects = CASE WHEN pl ? 'adverse_effects' THEN NULLIF(pl->>'adverse_effects','') ELSE adverse_effects END,
      choking_risk = CASE WHEN pl ? 'choking_risk' THEN (pl->>'choking_risk')::boolean ELSE choking_risk END,
      choking_risk_details = CASE WHEN pl ? 'choking_risk_details' THEN NULLIF(pl->>'choking_risk_details','') ELSE choking_risk_details END,
      is_controlled = CASE WHEN pl ? 'is_controlled' THEN (pl->>'is_controlled')::boolean ELSE is_controlled END,
      is_prn = CASE WHEN pl ? 'is_prn' THEN (pl->>'is_prn')::boolean ELSE is_prn END,
      prn_instructions = CASE WHEN pl ? 'prn_instructions' THEN NULLIF(pl->>'prn_instructions','') ELSE prn_instructions END,
      pharmacy = CASE WHEN pl ? 'pharmacy' THEN NULLIF(pl->>'pharmacy','') ELSE pharmacy END,
      rx_number = CASE WHEN pl ? 'rx_number' THEN NULLIF(pl->>'rx_number','') ELSE rx_number END,
      packaging = CASE WHEN pl ? 'packaging' THEN NULLIF(pl->>'packaging','') ELSE packaging END,
      side_effects = CASE WHEN pl ? 'side_effects' THEN NULLIF(pl->>'side_effects','') ELSE side_effects END,
      contributes_to_swallowing_difficulty = CASE WHEN pl ? 'contributes_to_swallowing_difficulty'
        THEN (pl->>'contributes_to_swallowing_difficulty')::boolean
        ELSE contributes_to_swallowing_difficulty END
    WHERE id = p.medication_id;
    new_med_id := p.medication_id;

  ELSIF p.change_type = 'discontinue' THEN
    IF p.medication_id IS NULL THEN RAISE EXCEPTION 'discontinue proposal missing medication_id'; END IF;
    UPDATE public.client_medications
      SET is_active = false,
          discontinued_at = now(),
          discontinued_by = auth.uid()
    WHERE id = p.medication_id;
    new_med_id := p.medication_id;
  ELSE
    RAISE EXCEPTION 'Unknown change_type: %', p.change_type;
  END IF;

  UPDATE public.medication_change_proposals
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        applied_medication_id = new_med_id
    WHERE id = _proposal_id;

  RETURN new_med_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_med_change_proposal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_med_change_proposal(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_med_change_proposal(_proposal_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.medication_change_proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.medication_change_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  IF NOT (public.has_org_role(p.organization_id, auth.uid(), 'admin')
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only an organization admin can reject medication changes';
  END IF;

  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal is not pending (status=%)', p.status;
  END IF;

  UPDATE public.medication_change_proposals
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = _notes
    WHERE id = _proposal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_med_change_proposal(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_med_change_proposal(uuid, text) TO authenticated;
