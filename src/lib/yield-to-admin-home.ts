/** Query keys for the two Admin Home selects. Shared so the layout can wait on them. */
export const ADMIN_HOME_INSTANCES_KEY = "admin-home-obligation-instances";
export const ADMIN_HOME_CLIENTS_KEY = "admin-home-clients";
export const ADMIN_HOME_STAFF_STATUS_KEY = "admin-home-staff-status";

export function adminHomeInstancesQueryKey(orgId: string | null) {
  return [ADMIN_HOME_INSTANCES_KEY, orgId] as const;
}

export function adminHomeClientsQueryKey(orgId: string | null) {
  return [ADMIN_HOME_CLIENTS_KEY, orgId] as const;
}

export function adminHomeStaffStatusQueryKey(orgId: string | null) {
  return [ADMIN_HOME_STAFF_STATUS_KEY, orgId] as const;
}

export function isAdminHomePath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname === "/dashboard/";
}

/**
 * Layout obligation fan-out (action-required queue + deadlines/bell) may run
 * unless we are on Admin Home and those two home queries have not settled yet.
 * `gaveUp` covers the case where Admin Home never mounts.
 */
export function layoutQueriesMayRun(args: {
  onAdminHome: boolean;
  instancesStatus: string | undefined;
  clientsStatus: string | undefined;
  gaveUp: boolean;
}): boolean {
  if (!args.onAdminHome) return true;
  if (args.gaveUp) return true;
  return (
    args.instancesStatus != null &&
    args.instancesStatus !== "pending" &&
    args.clientsStatus != null &&
    args.clientsStatus !== "pending"
  );
}

export function adminHomeQueriesStarted(
  instancesStatus: string | undefined,
  clientsStatus: string | undefined,
): boolean {
  return instancesStatus != null || clientsStatus != null;
}
