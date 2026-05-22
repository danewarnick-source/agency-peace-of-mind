-- Reset training_modules to the new schema
DROP TABLE IF EXISTS public.user_training_progress CASCADE;
DROP TABLE IF EXISTS public.training_modules CASCADE;

CREATE TABLE public.training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  sequence_order integer NOT NULL UNIQUE,
  mindsmith_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authenticated can read training modules"
  ON public.training_modules FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.user_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);

ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own progress"
  ON public.user_training_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users insert own progress"
  ON public.user_training_progress FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own progress"
  ON public.user_training_progress FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users delete own progress"
  ON public.user_training_progress FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX user_training_progress_user_idx ON public.user_training_progress(user_id);
CREATE INDEX user_training_progress_module_idx ON public.user_training_progress(module_id);

-- Seed the 6 DSPD compliance modules
INSERT INTO public.training_modules (title, description, sequence_order, mindsmith_url) VALUES
('Module 1: Emergency & Medical Response',
 'Compliance training covering 911 protocols, medical/mental health crises, first-time seizures, and missing person elopement.',
 1, 'https://app.mindsmith.ai/learn/cmpgje07b00040cjcev1qcjwq'),
('Module 2: Behavioral Supports & Crisis Prevention',
 'Mastering Utah Administrative Code R539-4 Level 1 positive behavioral supports, trauma-informed care, and crisis de-escalation.',
 2, 'https://app.mindsmith.ai/learn/cmpgjgwoc000z0bje8fvzdg67'),
('Module 3: Rights, Advocacy, & Legal Compliance',
 'Grounding staff in civil rights under the ADA, the HCBS Settings Rule, HIPAA privacy mandates, and mandatory ANE reporting.',
 3, 'https://app.mindsmith.ai/learn/cmpgjjlpr00440bhuqw97s49r'),
('Module 4: Utah DHHS & DSPD Philosophy',
 'An introduction to self-determination, community presence models, Medicaid 101, and orientation to ID.RC and ABI populations.',
 4, 'https://app.mindsmith.ai/learn/cmpgjnlpc002u0bkp3gz497ft'),
('Module 5: Person-Centered & End-of-Life Care',
 'Navigating PCSPs and BSPs, supervisor escalation boundaries, and handling end-of-life directives like DNR and POLST protocols.',
 5, 'https://app.mindsmith.ai/learn/cmpgjqdfv000d0bkn4mk32wau'),
('Section 6: Final Compliance Certification Quiz',
 'The comprehensive 20-question state compliance assessment. Must finish all 5 preceding modules to unlock.',
 6, 'https://app.mindsmith.ai/learn/cmpgjsk5q003z0bi5gewkosmd');
