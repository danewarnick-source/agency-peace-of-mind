
-- 1) Organization branding (logo + contact block used on face sheet header)
CREATE TABLE IF NOT EXISTS public.organization_branding (
  organization_id  uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  logo_path        text,
  logo_uploaded_at timestamptz,
  org_address      text,
  org_phone        text,
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_branding TO authenticated;
GRANT ALL ON public.organization_branding TO service_role;

ALTER TABLE public.organization_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read branding"
  ON public.organization_branding FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins manage branding"
  ON public.organization_branding FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- 2) Staff photo fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz;

-- 3) Face-sheet fields on clients (idempotent adds)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_photo_taken_on date,
  ADD COLUMN IF NOT EXISTS pcsp_signed_date date,
  ADD COLUMN IF NOT EXISTS intake_date date,
  ADD COLUMN IF NOT EXISTS client_pid text,
  ADD COLUMN IF NOT EXISTS place_of_birth text,
  ADD COLUMN IF NOT EXISTS ssn_last4 text,
  ADD COLUMN IF NOT EXISTS ethnic_origin text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS medicaid_case_number text,
  ADD COLUMN IF NOT EXISTS medicare_number text,
  ADD COLUMN IF NOT EXISTS private_insurance text,
  ADD COLUMN IF NOT EXISTS state_id_number text,
  ADD COLUMN IF NOT EXISTS state_id_expires_on date,
  ADD COLUMN IF NOT EXISTS payment_sources text[],
  ADD COLUMN IF NOT EXISTS income_sources text[],
  ADD COLUMN IF NOT EXISTS residential_provider text,
  ADD COLUMN IF NOT EXISTS day_program_provider text,
  ADD COLUMN IF NOT EXISTS physician_address text,
  ADD COLUMN IF NOT EXISTS dentist_address text,
  ADD COLUMN IF NOT EXISTS psychiatrist_name text,
  ADD COLUMN IF NOT EXISTS psychiatrist_phone text,
  ADD COLUMN IF NOT EXISTS psychiatrist_address text,
  ADD COLUMN IF NOT EXISTS pertinent_health_notes text,
  ADD COLUMN IF NOT EXISTS dietary_needs text,
  ADD COLUMN IF NOT EXISTS height_inches integer,
  ADD COLUMN IF NOT EXISTS weight_pounds integer,
  ADD COLUMN IF NOT EXISTS hair_color text,
  ADD COLUMN IF NOT EXISTS eye_color text,
  ADD COLUMN IF NOT EXISTS places_frequented text,
  ADD COLUMN IF NOT EXISTS emergency_contact_address text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_address text,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_relationship text;

-- 4) Storage RLS for new buckets (org-branding, staff-photos).
-- Path convention: '{organization_id}/...'  ->  storage.foldername(name)[1]
-- These policies are additive; existing client-photos policies are untouched.

CREATE POLICY "org members read org-branding"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'org-branding'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org admins write org-branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-branding'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org admins update org-branding"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-branding'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org admins delete org-branding"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-branding'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org members read staff-photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org members write staff-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-photos'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org members update staff-photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org admins delete staff-photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND public.is_org_admin_or_manager((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- 5) updated_at trigger for organization_branding
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_organization_branding_updated_at ON public.organization_branding;
CREATE TRIGGER trg_organization_branding_updated_at
  BEFORE UPDATE ON public.organization_branding
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
