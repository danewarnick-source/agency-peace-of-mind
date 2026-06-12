CREATE TABLE IF NOT EXISTS public.org_email_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_name text NOT NULL DEFAULT '',
  from_address text NOT NULL DEFAULT '',
  reply_to text,
  verified boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_email_settings TO authenticated;
GRANT ALL ON public.org_email_settings TO service_role;

ALTER TABLE public.org_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_email_settings_select_members"
  ON public.org_email_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "org_email_settings_admin_insert"
  ON public.org_email_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "org_email_settings_admin_update"
  ON public.org_email_settings FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

CREATE POLICY "org_email_settings_admin_delete"
  ON public.org_email_settings FOR DELETE TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

INSERT INTO public.role_permissions (organization_id, role, permission)
SELECT o.id, r.role, 'send_emails'
FROM public.organizations o
CROSS JOIN (VALUES ('admin'::app_role), ('super_admin'::app_role)) AS r(role)
ON CONFLICT DO NOTHING;