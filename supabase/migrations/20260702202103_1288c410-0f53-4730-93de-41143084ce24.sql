CREATE TABLE public.hive_training_renewal_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  stripe_session_id text NOT NULL,
  catalog_id uuid NOT NULL,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_htri_session ON public.hive_training_renewal_intents(stripe_session_id);
CREATE INDEX idx_htri_org ON public.hive_training_renewal_intents(organization_id);

GRANT SELECT, INSERT, UPDATE ON public.hive_training_renewal_intents TO authenticated;
GRANT ALL ON public.hive_training_renewal_intents TO service_role;

ALTER TABLE public.hive_training_renewal_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read renewal intents"
  ON public.hive_training_renewal_intents FOR SELECT
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "Org admins create renewal intents"
  ON public.hive_training_renewal_intents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));