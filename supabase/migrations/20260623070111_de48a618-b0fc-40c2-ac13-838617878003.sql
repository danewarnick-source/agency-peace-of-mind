
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pcsp_expiration_date date;

CREATE TABLE IF NOT EXISTS public.client_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  relationship text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_emergency_contacts TO authenticated;
GRANT ALL ON public.client_emergency_contacts TO service_role;

ALTER TABLE public.client_emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read emergency contacts"
  ON public.client_emergency_contacts FOR SELECT
  USING (is_org_member(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "managers write emergency contacts"
  ON public.client_emergency_contacts FOR ALL
  USING (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_org_admin_or_manager(organization_id, auth.uid()) OR is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS client_emergency_contacts_client_idx
  ON public.client_emergency_contacts(client_id);
