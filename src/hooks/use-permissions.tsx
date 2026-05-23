import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { ALL_PERMISSIONS, DEFAULT_MATRIX, type Permission, type Role } from "@/lib/rbac";

export type PermissionMap = Record<Role, Record<Permission, boolean>>;

function buildDefault(): PermissionMap {
  const out = {} as PermissionMap;
  (["super_admin", "admin", "manager", "employee"] as Role[]).forEach((r) => {
    out[r] = {} as Record<Permission, boolean>;
    ALL_PERMISSIONS.forEach((p) => {
      out[r][p] = DEFAULT_MATRIX[r].includes(p);
    });
  });
  return out;
}

/** Org-scoped permission matrix. Falls back to DEFAULT_MATRIX when no overrides exist. */
export function useOrgPermissions() {
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!org,
    queryKey: ["role-permissions", org?.organization_id],
    queryFn: async (): Promise<PermissionMap> => {
      const map = buildDefault();
      const { data } = await supabase
        .from("role_permissions")
        .select("role, permission, enabled")
        .eq("organization_id", org!.organization_id);
      (data ?? []).forEach((row) => {
        const r = row.role as Role;
        const p = row.permission as Permission;
        if (map[r] && p in map[r]) map[r][p] = !!row.enabled;
      });
      return map;
    },
  });
}

/** Convenience: returns can(perm) for the current user's role using DB overrides. */
export function usePermissions() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const { data: matrix, isLoading: matrixLoading } = useOrgPermissions();
  const role = (org?.role ?? null) as Role | null;
  const can = (perm: Permission): boolean => {
    if (!role) return false;
    if (matrix) return !!matrix[role]?.[perm];
    return DEFAULT_MATRIX[role].includes(perm);
  };
  // Wait for org to load before reporting ready — otherwise role-based guards
  // see role=null and incorrectly redirect to /unauthorized on first paint.
  return { role, can, isLoading: orgLoading || matrixLoading };
}
