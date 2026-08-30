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

/** Portaled listbox. Used so the mobile Sheet does not treat option taps as "outside". */
export const PORTAL_VIEW_MENU_ATTR = "data-portal-view-menu";
export const PORTAL_VIEW_MENU_SELECTOR = "[data-portal-view-menu]";

export function isPortalViewMenuEventTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const node = target as { closest?: (selector: string) => unknown };
  if (typeof node.closest !== "function") return false;
  return Boolean(node.closest(PORTAL_VIEW_MENU_SELECTOR));
}

/**
 * Radix Sheet (Dialog) is modal: body gets pointer-events:none and any pointer
 * outside SheetContent dismisses the drawer. The Portal View menu is portaled
 * to document.body (it must be — the Sheet's slide transform would break
 * position:fixed), so a tap on Staff View is "outside" the drawer in the DOM.
 * Without this, the tap hits the dimmed page / closes the Sheet and never
 * commits the view.
 */
export function preventSheetDismissForPortalViewMenu(event: {
  preventDefault: () => void;
  target?: EventTarget | null;
  detail?: { originalEvent?: { target?: EventTarget | null } };
}): void {
  const fromDetail = event.detail?.originalEvent?.target;
  if (isPortalViewMenuEventTarget(fromDetail) || isPortalViewMenuEventTarget(event.target)) {
    event.preventDefault();
  }
}

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

export const ROLE_ENTRY_HOME: Record<string, string> = {
  super_admin: "/dashboard/hive-exec",
  admin: "/dashboard",
  program_manager: "/dashboard",
  manager: "/dashboard",
  employee: "/employee",
  committee_member: "/dashboard/hrc",
};

/**
 * `/admin` (and the other role-entry bookmarks) must persist the matching
 * Portal View. Otherwise an Owner who last used Staff View hits /admin,
 * sees "Redirecting…", and lands back on the staff dashboard.
 */
export function resolveRoleEntryLanding(input: {
  hasSession: boolean;
  role: string;
  allowed: readonly string[];
  persistView: PortalView | null;
}): { path: string; persistView: PortalView | null } {
  if (!input.hasSession) return { path: "/login", persistView: null };
  if (!input.allowed.includes(input.role)) {
    return { path: ROLE_ENTRY_HOME[input.role] ?? "/dashboard", persistView: null };
  }
  return { path: "/dashboard", persistView: input.persistView };
}
