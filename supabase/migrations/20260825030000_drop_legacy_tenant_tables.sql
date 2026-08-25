-- Drop leftover provider_tenants catalog. Feature flags moved to
-- feature_registry / org flags; client surfaces use DSPD codes + feature_config.
-- tenant_id columns on profiles / teams / evv_timesheets stay (all null).
-- employee_client_assignments is a view that aliases organization_id AS tenant_id.

BEGIN;

DROP TABLE IF EXISTS public.tenant_features;
ALTER TABLE public.evv_timesheets DROP CONSTRAINT IF EXISTS evv_timesheets_tenant_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tenant_id_fkey;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_tenant_id_fkey;
DROP TABLE IF EXISTS public.provider_tenants;
DROP TABLE IF EXISTS public.system_features;

DROP FUNCTION IF EXISTS public.has_capability(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.effective_capabilities(uuid, uuid);

COMMIT;
