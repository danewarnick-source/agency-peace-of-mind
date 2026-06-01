-- Celebration system

-- 1) celebration_events
CREATE TABLE public.celebration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  event_key text NOT NULL,
  scope_user_id uuid,
  tier smallint NOT NULL CHECK (tier IN (1, 2, 3)),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One-shot per achievement per scope. Using COALESCE so scope NULL is treated as a single "org-wide" bucket.
CREATE UNIQUE INDEX celebration_events_unique_scope
  ON public.celebration_events (organization_id, event_key, COALESCE(scope_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX celebration_events_org_created_idx
  ON public.celebration_events (organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.celebration_events TO authenticated;
GRANT ALL ON public.celebration_events TO service_role;

ALTER TABLE public.celebration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read celebrations"
  ON public.celebration_events FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())
         OR public.is_super_admin(auth.uid())
         OR public.is_hive_executive(auth.uid()));

CREATE POLICY "managers insert celebrations"
  ON public.celebration_events FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid())
              OR public.is_super_admin(auth.uid()));

-- 2) celebration_acknowledgements
CREATE TABLE public.celebration_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.celebration_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX celebration_ack_user_idx
  ON public.celebration_acknowledgements (user_id, event_id);

GRANT SELECT, INSERT, DELETE ON public.celebration_acknowledgements TO authenticated;
GRANT ALL ON public.celebration_acknowledgements TO service_role;

ALTER TABLE public.celebration_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own acks"
  ON public.celebration_acknowledgements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user inserts own acks"
  ON public.celebration_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user deletes own acks"
  ON public.celebration_acknowledgements FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3) org_celebration_settings
CREATE TABLE public.org_celebration_settings (
  organization_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  tier1_enabled boolean NOT NULL DEFAULT true,
  tier2_enabled boolean NOT NULL DEFAULT true,
  tier3_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.org_celebration_settings TO authenticated;
GRANT ALL ON public.org_celebration_settings TO service_role;

ALTER TABLE public.org_celebration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read org celeb settings"
  ON public.org_celebration_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid())
         OR public.is_super_admin(auth.uid())
         OR public.is_hive_executive(auth.uid()));

CREATE POLICY "managers write org celeb settings"
  ON public.org_celebration_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid())
              OR public.is_super_admin(auth.uid()));

CREATE POLICY "managers update org celeb settings"
  ON public.org_celebration_settings FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid())
              OR public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_org_celeb_settings_updated_at
  BEFORE UPDATE ON public.org_celebration_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) user_celebration_mute
CREATE TABLE public.user_celebration_mute (
  user_id uuid PRIMARY KEY,
  muted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_celebration_mute TO authenticated;
GRANT ALL ON public.user_celebration_mute TO service_role;

ALTER TABLE public.user_celebration_mute ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own mute"
  ON public.user_celebration_mute FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user inserts own mute"
  ON public.user_celebration_mute FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user updates own mute"
  ON public.user_celebration_mute FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_user_celeb_mute_updated_at
  BEFORE UPDATE ON public.user_celebration_mute
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
