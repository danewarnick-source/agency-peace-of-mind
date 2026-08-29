import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { type Role } from "@/lib/rbac";
import {
  COMPANY_ADMIN_ROLES,
  persistPortalView,
  resolveRoleEntryLanding,
  type PortalView,
} from "@/lib/portal-view-landing";

/** Generic role-entry redirector: validates the user's role, then sends them into /dashboard. */
function makeRoleEntry(allowed: Role[], persistView: PortalView | null) {
  return function RoleEntry() {
    const { session, loading } = useAuth();
    const { data: org, isLoading } = useCurrentOrg();
    const navigate = useNavigate();
    useEffect(() => {
      if (loading || isLoading) return;
      const role = (org?.role ?? "employee") as Role;
      const landing = resolveRoleEntryLanding({
        hasSession: !!session,
        role,
        allowed,
        persistView,
      });
      if (landing.persistView) persistPortalView(landing.persistView);
      navigate({ to: landing.path as "/dashboard", replace: true });
    }, [loading, isLoading, session, org?.role, navigate]);
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Opening {persistView === "admin" ? "Admin View" : "dashboard"}…
      </div>
    );
  };
}

export const AdminEntry = makeRoleEntry([...COMPANY_ADMIN_ROLES], "admin");
export const ManagerEntry = makeRoleEntry(["manager", "program_manager", "admin"], "admin");
export const EmployeeEntry = makeRoleEntry(
  ["employee", "manager", "program_manager", "admin"],
  "staff",
);

// Re-export createFileRoute for the route files to use.
export { createFileRoute };
