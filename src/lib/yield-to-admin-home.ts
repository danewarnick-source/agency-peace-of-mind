/** Query key for Admin Home setup counts. Shared so the layout can wait on it. */
export {
  ADMIN_HOME_SETUP_KEY,
  adminHomeSetupQueryKey,
} from "./admin-home-setup.ts";

export function isAdminHomePath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname === "/dashboard/";
}

/**
 * Layout obligation fan-out (action-required queue + deadlines/bell) may run
 * unless we are on Admin Home and the setup query has not settled yet.
 * `gaveUp` covers the case where Admin Home never mounts.
 */
export function layoutQueriesMayRun(args: {
  onAdminHome: boolean;
  setupStatus: string | undefined;
  gaveUp: boolean;
}): boolean {
  if (!args.onAdminHome) return true;
  if (args.gaveUp) return true;
  return args.setupStatus != null && args.setupStatus !== "pending";
}

export function adminHomeQueriesStarted(setupStatus: string | undefined): boolean {
  return setupStatus != null;
}
