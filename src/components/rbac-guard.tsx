import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { hasAnyRole, type Permission, type Role } from "@/lib/rbac";

export function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can, isLoading } = usePermissions();
  const navigate = useNavigate();
  const allowed = can(perm);
  // Keep the org null-check here. Do not treat "org not loaded yet" as deny.
  const waiting = authLoading || isLoading || (!!user && org === undefined);
  useEffect(() => {
    if (waiting) return;
    if (!allowed) {
      navigate({
        to: "/unauthorized",
        search: { perm, page: typeof window !== "undefined" ? window.location.pathname : undefined },
      });
    }
  }, [waiting, allowed, navigate, perm]);
  if (waiting || !allowed) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}

/** Hide children without redirecting. Use on edit chrome inside a viewable page. */
export function IfPermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can, isLoading } = usePermissions();
  if (isLoading || !can(perm)) return null;
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
