
ALTER TABLE public.feature_registry
  ADD COLUMN IF NOT EXISTS required_tier text,
  ADD COLUMN IF NOT EXISTS upgrade_blurb text;

UPDATE public.feature_registry
  SET required_tier = COALESCE(required_tier, 'pro'),
      upgrade_blurb = COALESCE(upgrade_blurb, 'Unlock ' || label || ' for your organization.');

CREATE TABLE IF NOT EXISTS public.feature_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  note text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feature_upgrade_requests_org_idx
  ON public.feature_upgrade_requests (organization_id, status);

GRANT SELECT, INSERT, UPDATE ON public.feature_upgrade_requests TO authenticated;
GRANT ALL ON public.feature_upgrade_requests TO service_role;

ALTER TABLE public.feature_upgrade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read their org's upgrade requests"
  ON public.feature_upgrade_requests FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active)
  );

CREATE POLICY "org members create requests for their org"
  ON public.feature_upgrade_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "executives update upgrade requests"
  ON public.feature_upgrade_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active));

CREATE TRIGGER update_feature_upgrade_requests_updated_at
  BEFORE UPDATE ON public.feature_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
