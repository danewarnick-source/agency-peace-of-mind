/**
 * Post-login Portal View routing for Hive Executives who may also belong to
 * a company (e.g. Dane: Hive Exec + True North Owner).
 *
 * Login used to always write `portal-view=hive_exec` for executives, which
 * trapped them on Command Center — especially on a phone, where Portal View
 * lives in the sidebar Sheet.
 */

export type PortalView = "staff" | "admin" | "staff_mobile" | "hive_exec" | "state_preview";

export const PORTAL_VIEW_KEY = "portal-view";
export const PORTAL_VIEW_CHANGE_EVENT = "portal-view-change";
export const OPEN_DASHBOARD_MENU_EVENT = "hive:open-dashboard-menu";

export const COMPANY_PORTAL_VIEWS = ["admin", "staff", "staff_mobile"] as const;
export const COMPANY_ADMIN_ROLES = ["admin", "super_admin", "program_manager", "manager"] as const;

export function isCompanyPortalView(
  v: string | null | undefined,
): v is (typeof COMPANY_PORTAL_VIEWS)[number] {
  return v === "admin" || v === "staff" || v === "staff_mobile";
}

export function isCompanyAdminRole(role: string | null | undefined): boolean {
  return (
    role === "admin" || role === "super_admin" || role === "program_manager" || role === "manager"
  );
}

export function readStoredPortalView(): PortalView | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PORTAL_VIEW_KEY);
    if (
      v === "admin" ||
      v === "staff" ||
      v === "staff_mobile" ||
      v === "hive_exec" ||
      v === "state_preview"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function persistPortalView(view: PortalView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PORTAL_VIEW_KEY, view);
    window.dispatchEvent(new Event(PORTAL_VIEW_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

export function companyAdminSwitchAccessibleName(companyName: string | null | undefined): string {
  const n = (companyName ?? "").trim();
  return n ? `Open ${n} Admin` : "Open company Admin";
}

export const STAFF_VIEW_ACCESSIBLE_NAME = "Staff view";

/**
 * What login should do with Portal View.
 * `persistView: null` means leave localStorage unchanged (do not overwrite).
 */
export function resolvePostLoginLanding(input: {
  isExecutive: boolean;
  storedView: PortalView | null;
  isCompanyAdmin: boolean;
}): { path: string; persistView: PortalView | null } {
  const { isExecutive, storedView, isCompanyAdmin } = input;

  if (!isExecutive) {
    return { path: "/dashboard", persistView: null };
  }

  // Honor an explicit company portal choice — never overwrite with hive_exec.
  if (isCompanyPortalView(storedView)) {
    return { path: "/dashboard", persistView: null };
  }

  // Honor last Command Center choice.
  if (storedView === "hive_exec") {
    return { path: "/dashboard/hive-exec", persistView: null };
  }

  // State preview is a company-shaped dashboard, not Command Center.
  if (storedView === "state_preview") {
    return { path: "/dashboard", persistView: null };
  }

  // No stored view: org admins land in Admin; platform-only execs land on Command Center.
  if (isCompanyAdmin) {
    return { path: "/dashboard", persistView: "admin" };
  }
  return { path: "/dashboard/hive-exec", persistView: "hive_exec" };
}

/** Resulting localStorage value after login (null stored stays null unless we persist). */
export function nextPortalViewAfterLogin(input: {
  isExecutive: boolean;
  storedView: PortalView | null;
  isCompanyAdmin: boolean;
}): PortalView | null {
  const landing = resolvePostLoginLanding(input);
  return landing.persistView ?? input.storedView;
}
