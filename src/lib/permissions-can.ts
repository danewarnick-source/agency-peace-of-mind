import { defaultCan, type Permission, type Role } from "./rbac.ts";

/**
 * True when the org's role_permissions query produced at least one enabled
 * grant for this role. An unseeded org yields an empty role row from
 * useOrgPermissions — that is not a deliberate lockout.
 */
export function roleMatrixHasAnyGrant(
  matrix: Record<string, Record<string, boolean>> | null | undefined,
  role: string,
): boolean {
  const row = matrix?.[role];
  if (!row) return false;
  return Object.values(row).some(Boolean);
}

/** True when this role has a role_permissions row for this exact key. */
export function roleMatrixHasPermissionRow(
  matrix: Record<string, Record<string, boolean>> | null | undefined,
  role: string,
  perm: string,
): boolean {
  const row = matrix?.[role];
  if (!row) return false;
  return Object.prototype.hasOwnProperty.call(row, perm);
}

/**
 * Same two-layer resolve as usePermissions().can():
 *   1. individual override
 *   2. org role_permissions row for this exact key (enabled or deliberate deny)
 *   3. DEFAULT_MATRIX when that key was never seeded
 *
 * A missing key is not a deny. TNS and other live orgs were seeded before
 * manage_users retired into view/edit_staff_records; pre-filling those keys
 * as false sent owners to /unauthorized on employee detail.
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

  if (roleMatrixHasPermissionRow(opts.matrix, role, opts.perm)) {
    return !!opts.matrix?.[role]?.[opts.perm];
  }

  return defaultCan(role, opts.perm);
}

/**
 * RequirePermission must wait for auth + org + matrix. TanStack Query v5
 * reports isLoading=false on a disabled query, so a full-page open of
 * /dashboard/employees/:id (the roster uses a hard navigation) used to
 * treat role=null as "no permission" and bounce to Access denied.
 */
export function permissionsAreLoading(opts: {
  authLoading: boolean;
  hasUser: boolean;
  org: unknown;
  orgPending: boolean;
  matrixPending: boolean;
  overridesPending: boolean;
}): boolean {
  if (opts.authLoading) return true;
  if (!opts.hasUser) return false;
  if (opts.org === undefined || opts.orgPending) return true;
  if (opts.org === null) return false;
  return opts.matrixPending || opts.overridesPending;
}

/** First result of an enabled query has not arrived yet (v5 disabled ≠ loading). */
export function queryAwaitingFirstResult(opts: {
  enabled: boolean;
  data: unknown;
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
}): boolean {
  return (
    opts.enabled &&
    opts.data === undefined &&
    !opts.isError &&
    (opts.isPending || opts.isFetching)
  );
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
