
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_packages TO authenticated;
GRANT ALL ON public.audit_packages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_subjects TO authenticated;
GRANT ALL ON public.audit_package_subjects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_access TO authenticated;
GRANT ALL ON public.audit_package_access TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_files TO authenticated;
GRANT ALL ON public.audit_files TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_files TO authenticated;
GRANT ALL ON public.audit_package_files TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_package_folders TO authenticated;
GRANT ALL ON public.audit_package_folders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auditor_accounts TO authenticated;
GRANT ALL ON public.auditor_accounts TO service_role;
