
-- Profile flags for conditional trainings (manual override; assignment scan also enables)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS requires_deescalation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_abi boolean NOT NULL DEFAULT false;

-- Baseline staff training completions (synthetic, key-based, one row per staff+training)
CREATE TABLE IF NOT EXISTS public.staff_baseline_training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  training_key text NOT NULL,
  completed_date date,
  expires_at date,
  evidence_document_id uuid,
  nectar_suggested_expires boolean NOT NULL DEFAULT false,
  notes text,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, staff_id, training_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_baseline_training_completions TO authenticated;
GRANT ALL ON public.staff_baseline_training_completions TO service_role;

ALTER TABLE public.staff_baseline_training_completions ENABLE ROW LEVEL SECURITY;

-- Staff can view their own; admin/manager can view those in their org with PII gate
CREATE POLICY "baseline training view"
  ON public.staff_baseline_training_completions
  FOR SELECT
  TO authenticated
  USING (
    staff_id = auth.uid()
    OR public.can_view_staff_pii(organization_id, staff_id, auth.uid())
  );

CREATE POLICY "baseline training write"
  ON public.staff_baseline_training_completions
  FOR ALL
  TO authenticated
  USING (public.can_view_staff_pii(organization_id, staff_id, auth.uid()) AND staff_id <> auth.uid())
  WITH CHECK (public.can_view_staff_pii(organization_id, staff_id, auth.uid()) AND staff_id <> auth.uid());

CREATE OR REPLACE FUNCTION public.touch_baseline_training_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_baseline_training_updated_at ON public.staff_baseline_training_completions;
CREATE TRIGGER trg_touch_baseline_training_updated_at
  BEFORE UPDATE ON public.staff_baseline_training_completions
  FOR EACH ROW EXECUTE FUNCTION public.touch_baseline_training_updated_at();
