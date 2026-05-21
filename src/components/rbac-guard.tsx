import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { can, hasAnyRole, type Permission, type Role } from "@/lib/rbac";

/** Renders children only if the current user has the permission, otherwise redirects to /unauthorized. */
export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { data: org, isLoading } = useCurrentOrg();
  const navigate = useNavigate();
  useEffect(() => {
    if (isLoading) return;
    if (!can(org?.role ?? null, perm)) navigate({ to: "/unauthorized" });
  }, [isLoading, org?.role, perm, navigate]);
  if (isLoading || !can(org?.role ?? null, perm)) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: org, isLoading } = useCurrentOrg();
  const navigate = useNavigate();
  useEffect(() => {
    if (isLoading) return;
    if (!hasAnyRole(org?.role ?? null, roles)) navigate({ to: "/unauthorized" });
  }, [isLoading, org?.role, roles, navigate]);
  if (isLoading || !hasAnyRole(org?.role ?? null, roles)) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}
