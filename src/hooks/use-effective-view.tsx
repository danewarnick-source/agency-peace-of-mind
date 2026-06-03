import { useCurrentOrg } from "./use-org";
import { usePortalView } from "./use-portal-view";

/** Resolves whether the current user is in admin view (admin/manager portal toggled to admin).
 *  State (Build/Preview) mode renders the real admin/staff surfaces parameterized by the
 *  selected state's template, so its subView counts as the effective view. */
export function useEffectiveView() {
  const { data: org } = useCurrentOrg();
  const { view, subView } = usePortalView();
  const role = org?.role ?? "employee";
  const isAdminCapable = role === "admin" || role === "manager" || role === "super_admin";
  const isStatePreview = view === "state_preview";
  const previewIsAdmin = isStatePreview && subView === "admin";
  const effective: "admin" | "staff" =
    previewIsAdmin || (isAdminCapable && view === "admin") ? "admin" : "staff";
  return { effective, role, isAdminCapable, org };
}
