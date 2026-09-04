/** Query keys for the two Admin Home selects. Shared so the layout can wait on them. */
export const ADMIN_HOME_INSTANCES_KEY = "admin-home-obligation-instances";
export const ADMIN_HOME_CLIENTS_KEY = "admin-home-clients";

export function adminHomeInstancesQueryKey(orgId: string | null) {
  return [ADMIN_HOME_INSTANCES_KEY, orgId] as const;
}

export function adminHomeClientsQueryKey(orgId: string | null) {
  return [ADMIN_HOME_CLIENTS_KEY, orgId] as const;
}

export function isAdminHomePath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname === "/dashboard/";
}

/**
 * Feeling-hero B Home has no obligation queries. Layout fan-out
 * (action-required queue + deadlines/bell) may run immediately.
 */
export function layoutQueriesMayRun(_args: {
  onAdminHome: boolean;
  instancesStatus: string | undefined;
  clientsStatus: string | undefined;
  gaveUp: boolean;
}): boolean {
  return true;
}

export function adminHomeQueriesStarted(
  instancesStatus: string | undefined,
  clientsStatus: string | undefined,
): boolean {
  return instancesStatus != null || clientsStatus != null;
}
