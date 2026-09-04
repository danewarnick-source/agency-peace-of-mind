import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { useAuth } from "./use-auth";
import { ALL_PERMISSIONS, PROVIDER_ROLES, type Permission, type ProviderRole, type Role } from "@/lib/rbac";
import { resolveCan } from "@/lib/permissions-can";

export type PermissionMap = Record<ProviderRole, Record<Permission, boolean>>;

function buildEmpty(): PermissionMap {
  const out = {} as PermissionMap;
  PROVIDER_ROLES.forEach((r) => {
    out[r] = {} as Record<Permission, boolean>;
    ALL_PERMISSIONS.forEach((p) => {
      out[r][p] = false;
    });
  });
  return out;
}

/**
 * Org-scoped role permission matrix, read straight from `role_permissions`.
 * New orgs are seeded by seed_org_role_permissions (trigger + signup RPC).
 * usePermissions() still falls back to DEFAULT_MATRIX when this query
 * returns no enabled grants — live Hive-Platform had 13 unseeded orgs
 * (Salt Lake Care Co / pi20 among them) and RequirePermission sent
 * owners to /unauthorized.
 */
export function useOrgPermissions() {
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!org,
    queryKey: ["role-permissions", org?.organization_id],
    queryFn: async (): Promise<PermissionMap> => {
      const map = buildEmpty();
      const { data } = await supabase
        .from("role_permissions")
        .select("role, permission, enabled")
        .eq("organization_id", org!.organization_id);
      (data ?? []).forEach((row) => {
        const r = row.role as ProviderRole;
        const p = row.permission as Permission;
        if (r in map && p in map[r]) map[r][p] = !!row.enabled;
      });
      return map;
    },
  });
}

export interface UserOverride {
  permission: string;
  granted: boolean;
  expires_at: string | null;
}

/** Fetches the current user's individual overrides for the active org. */
export function useUserOverrides() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  return useQuery({
    enabled: !!org && !!user,
    queryKey: ["user-permission-overrides", org?.organization_id, user?.id],
    queryFn: async (): Promise<UserOverride[]> => {
      const { data } = await supabase
        .from("user_permission_overrides")
        .select("permission, granted, expires_at")
        .eq("organization_id", org!.organization_id)
        .eq("user_id", user!.id);
      const now = new Date().toISOString();
      return (data ?? []).filter((r) => !r.expires_at || r.expires_at > now);
    },
  });
}

/**
 * Two-layer permission resolver for the current user:
 *   1. individual override (user_permission_overrides) — final answer if present
 *   2. org role_permissions, if that role has any enabled grant
 *   3. DEFAULT_MATRIX when the org was never seeded (fresh paid signup)
 */
export function usePermissions() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const { data: matrix, isLoading: matrixLoading } = useOrgPermissions();
  const { data: overrides, isLoading: overridesLoading } = useUserOverrides();

  const role = (org?.role ?? null) as Role | null;

  const can = (perm: Permission): boolean =>
    resolveCan({ role, perm, matrix, overrides });

  // Wait for org to load before reporting ready — otherwise role-based guards
  // see role=null and incorrectly redirect to /unauthorized on first paint.
  return { role, can, isLoading: orgLoading || matrixLoading || overridesLoading };
}

export type EffectivePermissionSource = "role" | "individual_grant" | "individual_deny";

export interface EffectivePermissionEntry {
  granted: boolean;
  source: EffectivePermissionSource;
  overrideDetails?: {
    by: string;
    reason: string;
    expires_at?: string;
  };
}

export interface EffectivePermissions {
  role: Role | null;
  resolved: Record<string, EffectivePermissionEntry>;
}

/** Admin-facing: resolve effective permissions for a specific staff member. */
export function useEffectivePermissions(userId: string | null) {
  const { data: org } = useCurrentOrg();
  return useQuery({
    enabled: !!org && !!userId,
    queryKey: ["effective-permissions", org?.organization_id, userId],
    queryFn: async (): Promise<EffectivePermissions> => {
      const { data: member } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", org!.organization_id)
        .eq("user_id", userId!)
        .eq("active", true)
        .maybeSingle();

      if (!member) return { role: null, resolved: {} };

      const { data: roleConfig } = await supabase
        .from("role_permissions")
        .select("permission, enabled")
        .eq("organization_id", org!.organization_id)
        .eq("role", member.role);

      const now = new Date().toISOString();
      const { data: overrides } = await supabase
        .from("user_permission_overrides")
        .select("permission, granted, expires_at, granted_by_name, reason, created_at")
        .eq("organization_id", org!.organization_id)
        .eq("user_id", userId!);

      const activeOverrides = (overrides ?? []).filter(
        (o) => !o.expires_at || o.expires_at > now,
      );

      const resolved: Record<string, EffectivePermissionEntry> = {};

      ALL_PERMISSIONS.forEach((perm) => {
        const override = activeOverrides.find((o) => o.permission === perm);
        if (override) {
          resolved[perm] = {
            granted: override.granted,
            source: override.granted ? "individual_grant" : "individual_deny",
            overrideDetails: {
              by: override.granted_by_name ?? "Unknown",
              reason: override.reason ?? "",
              expires_at: override.expires_at ?? undefined,
            },
          };
        } else {
          const roleRow = (roleConfig ?? []).find((r) => r.permission === perm);
          resolved[perm] = {
            granted: !!roleRow?.enabled,
            source: "role",
          };
        }
      });

      return { role: member.role as Role, resolved };
    },
  });
}
