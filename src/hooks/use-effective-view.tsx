import { useCurrentOrg } from "./use-org";
import { usePortalView } from "./use-portal-view";

/** Resolves whether the current user is in admin view (admin/manager portal toggled to admin). */
export function useEffectiveView() {
  const { data: org } = useCurrentOrg();
  const { view } = usePortalView();
  const role = org?.role ?? "employee";
  const isAdminCapable = role === "admin" || role === "manager" || role === "super_admin" || org?.role === "super_admin";
  const effective: "admin" | "staff" = isAdminCapable && view === "admin" ? "admin" : "staff";
  return { effective, role, isAdminCapable, org };
}
