import { defaultCan, type Permission, type Role } from "./rbac.ts";

/**
 * True when the org's role_permissions query produced at least one enabled
 * grant for this role. An unseeded org yields the all-false empty matrix
 * from useOrgPermissions — that is not a deliberate lockout.
 */
export function roleMatrixHasAnyGrant(
  matrix: Record<string, Record<string, boolean>> | null | undefined,
  role: string,
): boolean {
  const row = matrix?.[role];
  if (!row) return false;
  return Object.values(row).some(Boolean);
}

/**
 * Same two-layer resolve as usePermissions().can():
 *   1. individual override
 *   2. org role_permissions row, if this role has any enabled grant
 *   3. DEFAULT_MATRIX — so a fresh owner is not sent to /unauthorized
 */
export function resolveCan(opts: {
  role: Role | null | undefined;
  perm: Permission;
  matrix?: Record<string, Record<string, boolean>> | null;
  overrides?: Array<{ permission: string; granted: boolean }>;
}): boolean {
  const role = opts.role ?? null;
  if (!role) return false;

  const override = (opts.overrides ?? []).find((o) => o.permission === opts.perm);
  if (override !== undefined) return override.granted;

  if (role === "super_admin") return false;

  if (roleMatrixHasAnyGrant(opts.matrix, role)) {
    return !!opts.matrix?.[role]?.[opts.perm];
  }

  return defaultCan(role, opts.perm);
}

/**
 * Server-side companion to resolveCan. has_permission on live Hive-Platform
 * returns false for view_clients / view_staff_records on unseeded orgs
 * (fallback list is legacy keys only). If the org has zero
 * role_permissions rows, honor DEFAULT_MATRIX so Invite staff and other
 * requirePermission server fns work before the SQL handoff is pasted.
 */
export function allowUnseededPermissionFallback(
  hasPermissionRpc: boolean,
  orgRolePermissionRowCount: number,
  role: Role | null | undefined,
  perm: Permission,
): boolean {
  if (hasPermissionRpc) return true;
  if (orgRolePermissionRowCount > 0) return false;
  return defaultCan(role, perm);
}
