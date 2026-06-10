CREATE TABLE IF NOT EXISTS public.general_shifts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category             text NOT NULL DEFAULT 'general',
  note                 text,
  clock_in_timestamp   timestamptz NOT NULL DEFAULT now(),
  clock_out_timestamp  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_general_shifts_user_active
  ON public.general_shifts (user_id) WHERE clock_out_timestamp IS NULL;
CREATE INDEX IF NOT EXISTS idx_general_shifts_org
  ON public.general_shifts (organization_id);
CREATE INDEX IF NOT EXISTS idx_general_shifts_user_clockout
  ON public.general_shifts (user_id, clock_out_timestamp);

ALTER TABLE public.general_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff insert own general shift" ON public.general_shifts;
CREATE POLICY "staff insert own general shift"
  ON public.general_shifts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "staff read own or managers read all general shifts" ON public.general_shifts;
CREATE POLICY "staff read own or managers read all general shifts"
  ON public.general_shifts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "staff update own general shift" ON public.general_shifts;
CREATE POLICY "staff update own general shift"
  ON public.general_shifts FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_org_admin_or_manager(organization_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "managers delete general shifts" ON public.general_shifts;
CREATE POLICY "managers delete general shifts"
  ON public.general_shifts FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS general_shifts_touch_updated_at ON public.general_shifts;
CREATE TRIGGER general_shifts_touch_updated_at
  BEFORE UPDATE ON public.general_shifts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_shifts TO authenticated;
GRANT ALL ON public.general_shifts TO service_role;