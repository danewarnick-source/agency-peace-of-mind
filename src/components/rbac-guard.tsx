import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { hasAnyRole, type Permission, type Role } from "@/lib/rbac";

export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can, isLoading } = usePermissions();
  const navigate = useNavigate();
  const allowed = can(perm);
  useEffect(() => {
    if (isLoading) return;
    if (!allowed) navigate({ to: "/unauthorized" });
  }, [isLoading, allowed, navigate]);
  if (isLoading || !allowed) {
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
