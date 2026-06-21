
ALTER TABLE public.staff_baseline_training_completions
  ADD COLUMN IF NOT EXISTS nectar_name_match text,
  ADD COLUMN IF NOT EXISTS nectar_extracted_name text,
  ADD COLUMN IF NOT EXISTS nectar_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_signed_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_signed_off_by uuid;

DROP POLICY IF EXISTS "baseline training write" ON public.staff_baseline_training_completions;

CREATE POLICY "baseline training write"
  ON public.staff_baseline_training_completions
  FOR ALL
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
