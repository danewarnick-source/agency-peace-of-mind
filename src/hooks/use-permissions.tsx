import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "./use-org";
import { useAuth } from "./use-auth";
import {
  ALL_PERMISSIONS,
  PROVIDER_ROLES,
  type Permission,
  type ProviderRole,
  type Role,
} from "@/lib/rbac";
import { permissionsAreLoading, queryAwaitingFirstResult, resolveCan } from "@/lib/permissions-can";
import { fillRoleGrantedMap } from "@/lib/staff-permission-toggles";

export type PermissionMap = Record<ProviderRole, Record<Permission, boolean>>;

/** Sparse map: only keys that exist in role_permissions. Missing ≠ deny. */
function buildEmpty(): PermissionMap {
  const out = {} as PermissionMap;
  PROVIDER_ROLES.forEach((r) => {
    out[r] = {} as Record<Permission, boolean>;
  });
  return out;
}

/**
 * Org-scoped role permission matrix, read straight from `role_permissions`.
 * Only keys that have a row are present. resolveCan() falls back to
 * DEFAULT_MATRIX for unseeded keys so a retired manage_users →
 * edit_staff_records gap cannot send an owner to /unauthorized.
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
        if (r in map && (ALL_PERMISSIONS as readonly string[]).includes(p)) {
          map[r][p] = !!row.enabled;
        }
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
  const { user, loading: authLoading } = useAuth();
  const orgQ = useCurrentOrg();
  const matrixQ = useOrgPermissions();
  const overridesQ = useUserOverrides();

  const role = (orgQ.data?.role ?? null) as Role | null;

  const can = (perm: Permission): boolean =>
    resolveCan({ role, perm, matrix: matrixQ.data, overrides: overridesQ.data });

  // Wait for auth + org + matrix. Disabled queries report isLoading=false in
  // TanStack Query v5 — that used to look like "ready, no permission".
  const isLoading = permissionsAreLoading({
    authLoading,
    hasUser: !!user,
    org: orgQ.data,
    orgPending: queryAwaitingFirstResult({
      enabled: !!user,
      data: orgQ.data,
      isError: orgQ.isError,
      isPending: orgQ.isPending,
      isFetching: orgQ.isFetching,
    }),
    matrixPending: queryAwaitingFirstResult({
      enabled: !!orgQ.data,
      data: matrixQ.data,
      isError: matrixQ.isError,
      isPending: matrixQ.isPending,
      isFetching: matrixQ.isFetching,
    }),
    overridesPending: queryAwaitingFirstResult({
      enabled: !!orgQ.data && !!user,
      data: overridesQ.data,
      isError: overridesQ.isError,
      isPending: overridesQ.isPending,
      isFetching: overridesQ.isFetching,
    }),
  });

  return { role, can, isLoading };
}

export type EffectivePermissionSource = "role" | "individual_grant" | "individual_deny";

export interface EffectivePermissionEntry {
  granted: boolean;
  source: EffectivePermissionSource;
  roleGranted: boolean;
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

      const activeOverrides = (overrides ?? []).filter((o) => !o.expires_at || o.expires_at > now);

      const roleGrantedMap = fillRoleGrantedMap(
        member.role as Role,
        (roleConfig ?? []) as Array<{ permission: string; enabled: boolean }>,
      );

      const resolved: Record<string, EffectivePermissionEntry> = {};

      ALL_PERMISSIONS.forEach((perm) => {
        const roleGranted = !!roleGrantedMap.get(perm);
        const override = activeOverrides.find((o) => o.permission === perm);
        if (override) {
          resolved[perm] = {
            granted: override.granted,
            source: override.granted ? "individual_grant" : "individual_deny",
            roleGranted,
            overrideDetails: {
              by: override.granted_by_name ?? "Unknown",
              reason: override.reason ?? "",
              expires_at: override.expires_at ?? undefined,
            },
          };
        } else {
          resolved[perm] = {
            granted: roleGranted,
            source: "role",
            roleGranted,
          };
        }
      });

      return { role: member.role as Role, resolved };
    },
  });
}
