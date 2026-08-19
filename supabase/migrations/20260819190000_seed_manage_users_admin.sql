-- manage_users has no role_permissions row for the admin role in any
-- existing org (confirmed via SQL_HANDOFF diagnostic — 24/24 orgs came
-- back NULL), so admins hit /unauthorized on every route still gated by
-- perm="manage_users" (employee profile, clients, compliance desk, etc).
-- super_admin doesn't need a row here: src/hooks/use-permissions.tsx now
-- short-circuits super_admin to true, mirroring public.has_permission()'s
-- existing super_admin shortcut. This still seeds a super_admin row for
-- audit-trail consistency with the rest of the matrix.
INSERT INTO public.role_permissions (organization_id, role, permission, enabled)
SELECT o.id, r.role, 'manage_users', true
FROM public.organizations o
CROSS JOIN (VALUES ('admin'), ('super_admin')) AS r(role)
ON CONFLICT (organization_id, role, permission)
DO UPDATE SET enabled = true, updated_at = now()
WHERE public.role_permissions.enabled = false;
