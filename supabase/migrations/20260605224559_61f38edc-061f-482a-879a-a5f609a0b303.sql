
-- 22 core training topics + person-specific assignments + progress + immutable completion audit records

CREATE TABLE IF NOT EXISTS public.training_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  dspd_letter text,
  sort_order integer NOT NULL DEFAULT 0,
  mindsmith_url text,
  attestation_statement text NOT NULL DEFAULT 'I attest that I have personally completed this training, understand the material, and will apply it in my role supporting people served.',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.training_topics TO authenticated;
GRANT ALL ON public.training_topics TO service_role;
ALTER TABLE public.training_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authenticated reads training topics"
  ON public.training_topics FOR SELECT TO authenticated USING (true);

INSERT INTO public.training_topics (code, title, description, category, dspd_letter, sort_order) VALUES
  ('call_911', 'When to call 911', 'Recognizing life-threatening emergencies and activating EMS.', 'Emergencies & health', 'a', 10),
  ('call_medical', 'When to call a medical professional', 'Identifying non-emergency medical concerns that need a provider.', 'Emergencies & health', 'b', 20),
  ('call_mental_health', 'When to call a mental health professional', 'Recognizing mental health crises and accessing professional support.', 'Emergencies & health', 'c', 30),
  ('seizure_disorders', 'Seizure disorders', 'Types of seizures, safe response, and post-ictal care.', 'Emergencies & health', 'e', 40),
  ('choking_rescue', 'Choking rescue / Heimlich', 'Hands-on response to a choking emergency.', 'Emergencies & health', 'g', 50),
  ('choking_prevention', 'Prevention of choking', 'Diet textures, supervision, and safe-eating strategies.', 'Emergencies & health', 'h', 60),
  ('communicable_disease', 'Prevention of communicable diseases', 'Hand hygiene, PPE, and infection control basics.', 'Emergencies & health', 'n', 70),
  ('positive_behavior_supports', 'Positive behavior supports (R539-4)', 'Utah R539-4 framework for proactive, person-centered supports.', 'Behavior & care', 'i', 110),
  ('crisis_deescalation', 'Crisis de-escalation strategies', 'Verbal and environmental de-escalation techniques.', 'Behavior & care', NULL, 120),
  ('trauma_informed', 'Trauma-informed care', 'Recognizing trauma responses and providing safe, predictable supports.', 'Behavior & care', NULL, 130),
  ('suicide_prevention', 'Suicide prevention', 'Warning signs, safe questioning, and connecting to help.', 'Behavior & care', NULL, 140),
  ('incident_reporting', 'Incident reporting', 'When and how to file an incident report.', 'Rights & reporting', 'd', 210),
  ('whereabouts_unknown', 'Notification when a person''s whereabouts are unknown', 'Required notifications and steps when someone is missing.', 'Rights & reporting', 'f', 220),
  ('legal_rights_ada', 'Legal rights & the ADA', 'Civil rights protections under the ADA for people with disabilities.', 'Rights & reporting', 'j', 230),
  ('ane_reporting', 'Abuse, neglect & exploitation reporting', 'Mandatory reporter duties and reporting channels.', 'Rights & reporting', 'k', 240),
  ('hipaa_confidentiality', 'Confidentiality & HIPAA', 'Protecting health information and respecting privacy.', 'Rights & reporting', 'l', 250),
  ('oig_fraud_reporting', 'Reporting fraud, waste & abuse to the OIG', 'How and when to report concerns to the Office of Inspector General.', 'Rights & reporting', NULL, 260),
  ('idrc_abi_orientation', 'Orientation to ID/RC and ABI', 'Overview of intellectual disability / related conditions and acquired brain injury supports.', 'Foundations & compliance', 'm', 310),
  ('agency_policies', 'The agency''s policies & procedures', 'The provider''s own written policies and procedures.', 'Foundations & compliance', NULL, 320),
  ('dspd_philosophy', 'Introduction to DSPD philosophy & mission', 'Utah DSPD''s mission, values, and service philosophy.', 'Foundations & compliance', NULL, 330),
  ('dhhs_medicaid_101', 'DHHS Medicaid 101 (applicable portions)', 'Medicaid basics relevant to DSPD waiver services.', 'Foundations & compliance', NULL, 340),
  ('hcbs_settings_rule', 'HCBS Settings Rule', 'CMS Home and Community-Based Services Settings Rule essentials.', 'Foundations & compliance', NULL, 350)
ON CONFLICT (code) DO NOTHING;

-- Person-specific training assignments (one per staff/client pair)
CREATE TABLE IF NOT EXISTS public.training_person_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  mindsmith_url text,
  attestation_statement text NOT NULL DEFAULT 'I attest that I have completed person-specific training for the person named above, understand their individual support needs, and will follow their plan.',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
CREATE INDEX IF NOT EXISTS training_person_modules_user_idx ON public.training_person_modules(user_id);
CREATE INDEX IF NOT EXISTS training_person_modules_org_idx ON public.training_person_modules(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_person_modules TO authenticated;
GRANT ALL ON public.training_person_modules TO service_role;
ALTER TABLE public.training_person_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read own person modules"
  ON public.training_person_modules FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "managers read org person modules"
  ON public.training_person_modules FOR SELECT TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers manage person modules insert"
  ON public.training_person_modules FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers manage person modules update"
  ON public.training_person_modules FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));
CREATE POLICY "managers manage person modules delete"
  ON public.training_person_modules FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- Topic / person-module progress
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_progress_status') THEN
    CREATE TYPE public.training_progress_status AS ENUM ('not_started','in_progress','completed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_topic_kind') THEN
    CREATE TYPE public.training_topic_kind AS ENUM ('core','person');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.training_topic_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_kind public.training_topic_kind NOT NULL,
  ref_id uuid NOT NULL,
  status public.training_progress_status NOT NULL DEFAULT 'not_started',
  position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic_kind, ref_id)
);
CREATE INDEX IF NOT EXISTS training_topic_progress_user_idx ON public.training_topic_progress(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_topic_progress TO authenticated;
GRANT ALL ON public.training_topic_progress TO service_role;
ALTER TABLE public.training_topic_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage own topic progress select"
  ON public.training_topic_progress FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff manage own topic progress insert"
  ON public.training_topic_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff manage own topic progress update"
  ON public.training_topic_progress FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "managers read org topic progress"
  ON public.training_topic_progress FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = training_topic_progress.user_id
      AND public.is_org_admin_or_manager(m.organization_id, auth.uid())
  ));

-- Immutable audit completion records
CREATE TABLE IF NOT EXISTS public.training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_kind public.training_topic_kind NOT NULL,
  ref_id uuid NOT NULL,
  topic_code text,
  topic_title text NOT NULL,
  dspd_letter text,
  attestation_statement text NOT NULL,
  typed_signature text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS training_completions_user_idx ON public.training_completions(user_id);
CREATE INDEX IF NOT EXISTS training_completions_ref_idx ON public.training_completions(topic_kind, ref_id);
GRANT SELECT, INSERT ON public.training_completions TO authenticated;
GRANT ALL ON public.training_completions TO service_role;
ALTER TABLE public.training_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read own completions"
  ON public.training_completions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff insert own completions"
  ON public.training_completions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "managers read org completions"
  ON public.training_completions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = training_completions.user_id
      AND public.is_org_admin_or_manager(m.organization_id, auth.uid())
  ));

-- When a new completion is inserted, demote previous ones to non-current.
CREATE OR REPLACE FUNCTION public.training_mark_prior_completions_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.training_completions
  SET is_current = false
  WHERE user_id = NEW.user_id
    AND topic_kind = NEW.topic_kind
    AND ref_id = NEW.ref_id
    AND id <> NEW.id
    AND is_current = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS training_completions_mark_stale ON public.training_completions;
CREATE TRIGGER training_completions_mark_stale
AFTER INSERT ON public.training_completions
FOR EACH ROW EXECUTE FUNCTION public.training_mark_prior_completions_stale();
