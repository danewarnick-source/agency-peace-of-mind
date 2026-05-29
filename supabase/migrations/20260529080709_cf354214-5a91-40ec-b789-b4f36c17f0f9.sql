CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.scheduled_shifts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id            uuid NOT NULL,
  client_id           uuid NOT NULL,
  job_code            text,
  shift_type          text NOT NULL DEFAULT 'hourly',
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  notes               text,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined')),
  published           boolean NOT NULL DEFAULT false,
  is_recurring        boolean NOT NULL DEFAULT false,
  recurrence_rule     text,
  recurrence_end_date timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_shifts TO authenticated;
GRANT ALL ON public.scheduled_shifts TO service_role;

ALTER TABLE public.scheduled_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view shifts"
  ON public.scheduled_shifts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org members can insert shifts"
  ON public.scheduled_shifts FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org members can update shifts"
  ON public.scheduled_shifts FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()))
  WITH CHECK (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org members can delete shifts"
  ON public.scheduled_shifts FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE TRIGGER scheduled_shifts_set_updated_at
  BEFORE UPDATE ON public.scheduled_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scheduled_shifts
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined')),
  ADD COLUMN IF NOT EXISTS published           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recurring        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule     text,
  ADD COLUMN IF NOT EXISTS recurrence_end_date timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_org_month
  ON public.scheduled_shifts (organization_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_staff
  ON public.scheduled_shifts (staff_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_shifts_client
  ON public.scheduled_shifts (client_id, starts_at DESC);