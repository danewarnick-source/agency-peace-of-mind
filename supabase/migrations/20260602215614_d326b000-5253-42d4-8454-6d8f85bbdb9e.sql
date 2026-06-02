
CREATE TABLE public.state_onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL REFERENCES public.platform_states(code) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX state_onboarding_sessions_one_open
  ON public.state_onboarding_sessions(state_code)
  WHERE status = 'in_progress';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_onboarding_sessions TO authenticated;
GRANT ALL ON public.state_onboarding_sessions TO service_role;

ALTER TABLE public.state_onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HIVE execs read onboarding sessions"
  ON public.state_onboarding_sessions FOR SELECT
  USING (public.is_hive_executive(auth.uid()));

CREATE POLICY "HIVE execs write onboarding sessions"
  ON public.state_onboarding_sessions FOR INSERT
  WITH CHECK (public.is_hive_executive(auth.uid()));

CREATE POLICY "HIVE execs update onboarding sessions"
  ON public.state_onboarding_sessions FOR UPDATE
  USING (public.is_hive_executive(auth.uid()));

CREATE POLICY "HIVE execs delete onboarding sessions"
  ON public.state_onboarding_sessions FOR DELETE
  USING (public.is_hive_executive(auth.uid()));

CREATE TRIGGER state_onboarding_sessions_touch
  BEFORE UPDATE ON public.state_onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
