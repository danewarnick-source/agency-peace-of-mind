
ALTER TABLE public.training_topics
  ADD COLUMN IF NOT EXISTS default_hours numeric(5,2);

UPDATE public.nectar_requirements
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'requirement_type','cumulative_hours',
  'target_hours',12,
  'window','employment_year',
  'enforced_after_months',12
)
WHERE requirement_key = 'hr_staff:annual_12hr_training'
  AND metadata->>'scope' = 'hr_staff_checklist';

CREATE TABLE IF NOT EXISTS public.staff_training_hours_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.nectar_requirements(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sthe_org_staff
  ON public.staff_training_hours_entries(organization_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_sthe_entry_date
  ON public.staff_training_hours_entries(entry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_training_hours_entries TO authenticated;
GRANT ALL ON public.staff_training_hours_entries TO service_role;

ALTER TABLE public.staff_training_hours_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sthe read gated" ON public.staff_training_hours_entries;
CREATE POLICY "sthe read gated"
  ON public.staff_training_hours_entries
  FOR SELECT
  TO authenticated
  USING (public.can_view_staff_pii(organization_id, staff_id, auth.uid()));

DROP POLICY IF EXISTS "sthe write admin or team manager" ON public.staff_training_hours_entries;
CREATE POLICY "sthe write admin or team manager"
  ON public.staff_training_hours_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() <> staff_id
    AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
  );

DROP POLICY IF EXISTS "sthe update admin or team manager" ON public.staff_training_hours_entries;
CREATE POLICY "sthe update admin or team manager"
  ON public.staff_training_hours_entries
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() <> staff_id
    AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
  );

DROP POLICY IF EXISTS "sthe delete admin or team manager" ON public.staff_training_hours_entries;
CREATE POLICY "sthe delete admin or team manager"
  ON public.staff_training_hours_entries
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() <> staff_id
    AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
  );

DROP TRIGGER IF EXISTS trg_sthe_updated_at ON public.staff_training_hours_entries;
CREATE TRIGGER trg_sthe_updated_at
  BEFORE UPDATE ON public.staff_training_hours_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
