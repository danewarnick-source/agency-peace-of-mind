import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { ROLE_HOME, type Role } from "@/lib/rbac";

/** Generic role-entry redirector: validates the user's role, then sends them into /dashboard. */
function makeRoleEntry(allowed: Role[]) {
  return function RoleEntry() {
    const { session, loading } = useAuth();
    const { data: org, isLoading } = useCurrentOrg();
    const navigate = useNavigate();
    useEffect(() => {
      if (loading || isLoading) return;
      if (!session) return navigate({ to: "/login" });
      const role = (org?.role ?? "employee") as Role;
      if (!allowed.includes(role)) {
        // Send to their own role home instead of unauthorized — feels nicer than dead-ending.
        navigate({ to: ROLE_HOME[role] });
        return;
      }
      navigate({ to: "/dashboard" });
    }, [loading, isLoading, session, org?.role, navigate]);
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Redirecting…</div>;
  };
}

export const AdminEntry = makeRoleEntry(["admin", "super_admin"]);
export const ManagerEntry = makeRoleEntry(["manager", "admin", "super_admin"]);
export const EmployeeEntry = makeRoleEntry(["employee", "manager", "admin", "super_admin"]);
export const SuperAdminEntry = makeRoleEntry(["super_admin"]);

// Re-export createFileRoute for the route files to use.
export { createFileRoute };
