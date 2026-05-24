-- Provider tenants registry
CREATE TABLE IF NOT EXISTS public.provider_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name TEXT NOT NULL,
  owner_email TEXT NOT NULL UNIQUE,
  client_tier_limit INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  feature_quickbooks_sync BOOLEAN NOT NULL DEFAULT false,
  feature_pba_bank_feed BOOLEAN NOT NULL DEFAULT false,
  feature_ai_receipt_ocr BOOLEAN NOT NULL DEFAULT false,
  feature_lms_training BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins manage tenants"
  ON public.provider_tenants
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "owners read own tenant"
  ON public.provider_tenants
  FOR SELECT
  TO authenticated
  USING (lower(owner_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

CREATE TRIGGER provider_tenants_touch
  BEFORE UPDATE ON public.provider_tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Profiles linkage
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.provider_tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS system_role TEXT NOT NULL DEFAULT 'staff';

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_system_role ON public.profiles(system_role);
