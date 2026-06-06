CREATE TABLE public.training_checklist_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_topic_id uuid NOT NULL REFERENCES public.training_topics(id) ON DELETE CASCADE,
  requirement_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_topic_id, requirement_key)
);

GRANT SELECT ON public.training_checklist_mappings TO authenticated;
GRANT ALL ON public.training_checklist_mappings TO service_role;

ALTER TABLE public.training_checklist_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read training_checklist_mappings"
  ON public.training_checklist_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "hive exec manage training_checklist_mappings"
  ON public.training_checklist_mappings FOR ALL TO authenticated
  USING (public.is_hive_executive(auth.uid()))
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE TRIGGER training_checklist_mappings_set_updated_at
BEFORE UPDATE ON public.training_checklist_mappings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the 16 confirmed mappings.
INSERT INTO public.training_checklist_mappings (training_topic_id, requirement_key)
SELECT t.id, m.requirement_key
FROM public.training_topics t
JOIN (VALUES
  ('call_911','hr_staff:train_call_911'),
  ('call_medical','hr_staff:train_call_medical'),
  ('seizure_disorders','hr_staff:train_seizure'),
  ('choking_rescue','hr_staff:train_choking_rescue'),
  ('choking_prevention','hr_staff:train_choking_prevention'),
  ('communicable_disease','hr_staff:train_communicable'),
  ('positive_behavior_supports','hr_staff:train_positive_behavior'),
  ('incident_reporting','hr_staff:train_incident_reporting'),
  ('whereabouts_unknown','hr_staff:train_missing_person'),
  ('legal_rights_ada','hr_staff:train_legal_rights_ada'),
  ('ane_reporting','hr_staff:train_abuse_neglect'),
  ('hipaa_confidentiality','hr_staff:train_hipaa'),
  ('idrc_abi_orientation','hr_staff:train_idrc_abi'),
  ('agency_policies','hr_staff:train_contractor_policies'),
  ('dspd_philosophy','hr_staff:train_dspd_philosophy'),
  ('dhhs_medicaid_101','hr_staff:train_medicaid_101')
) AS m(code, requirement_key) ON m.code = t.code
ON CONFLICT DO NOTHING;

-- Provenance columns on staff_checklist_completion.
ALTER TABLE public.staff_checklist_completion
  ADD COLUMN IF NOT EXISTS training_completion_id uuid
    REFERENCES public.training_completions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_checked_at timestamptz;

-- Trigger: signed training → auto-check matching HR checklist items
-- across every org the staff is an active member of.
CREATE OR REPLACE FUNCTION public.auto_check_hr_from_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  IF NEW.is_current = false THEN RETURN NEW; END IF;
  IF NEW.topic_kind <> 'core' THEN RETURN NEW; END IF;

  FOR rec IN
    SELECT om.organization_id, r.id AS requirement_id
    FROM public.organization_members om
    JOIN public.training_checklist_mappings m
      ON m.training_topic_id = NEW.ref_id AND m.is_active
    JOIN public.nectar_requirements r
      ON r.organization_id = om.organization_id
     AND r.requirement_key = m.requirement_key
     AND r.approval_state = 'provider_confirmed'
     AND COALESCE(r.metadata->>'scope','') = 'hr_staff_checklist'
    WHERE om.user_id = NEW.user_id
      AND om.active = true
  LOOP
    INSERT INTO public.staff_checklist_completion (
      organization_id, staff_id, requirement_id, status,
      completed_date, completed_by, training_completion_id, auto_checked_at,
      notes
    ) VALUES (
      rec.organization_id, NEW.user_id, rec.requirement_id, 'complete',
      (NEW.completed_at AT TIME ZONE 'UTC')::date, NEW.user_id, NEW.id, now(),
      'Auto-checked from signed training: ' || COALESCE(NEW.topic_title, NEW.topic_code, '(topic)')
    )
    ON CONFLICT (staff_id, requirement_id) DO UPDATE
      SET status = 'complete',
          completed_date = EXCLUDED.completed_date,
          completed_by = EXCLUDED.completed_by,
          training_completion_id = EXCLUDED.training_completion_id,
          auto_checked_at = EXCLUDED.auto_checked_at,
          notes = EXCLUDED.notes,
          updated_at = now();
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_check_hr_from_training ON public.training_completions;
CREATE TRIGGER trg_auto_check_hr_from_training
AFTER INSERT ON public.training_completions
FOR EACH ROW EXECUTE FUNCTION public.auto_check_hr_from_training();