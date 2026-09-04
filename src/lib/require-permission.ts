// Server-side permission gate. Mirrors client `can(perm)` via has_permission()
// plus DEFAULT_MATRIX when the org has zero role_permissions rows (fresh
// paid signup on live Hive-Platform). Throws so the server fn returns
// 500/403 to the caller — never silently passes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireOrgMembership, type AppRole } from "@/integrations/supabase/require-org";
import { ALL_PERMISSIONS, type Permission, type Role } from "@/lib/rbac";
import { allowUnseededPermissionFallback } from "@/lib/permissions-can";

type AnySupabase = SupabaseClient<Database> | SupabaseClient;

async function allowIfUnseededOrg(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  perm: string,
): Promise<boolean> {
  if (!(ALL_PERMISSIONS as readonly string[]).includes(perm)) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberQ = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countQ = await (supabase as any)
    .from("role_permissions")
    .select("permission", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  const role = (memberQ.data?.role ?? null) as Role | null;
  return allowUnseededPermissionFallback(false, countQ.count ?? 0, role, perm as Permission);
}

export async function requirePermission(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  perm: string,
): Promise<void> {
  // Membership first — keeps error messaging consistent with other server fns
  // and ensures org context is valid before we ask about permissions.
  await requireOrgMembership(supabase, userId, organizationId, "employee");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("has_permission", {
    _user_id: userId,
    _org_id: organizationId,
    _perm: perm,
  });

  if (error) throw new Error("Permission check failed");
  if (data === true) return;
  if (await allowIfUnseededOrg(supabase, userId, organizationId, perm)) return;

  throw new Error(`Forbidden: missing permission ${perm}`);
}

export async function requireAnyPermission(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  perms: string[],
): Promise<void> {
  await requireOrgMembership(supabase, userId, organizationId, "employee");
  for (const perm of perms) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("has_permission", {
      _user_id: userId,
      _org_id: organizationId,
      _perm: perm,
    });
    if (error) throw new Error("Permission check failed");
    if (data === true) return;
    if (await allowIfUnseededOrg(supabase, userId, organizationId, perm)) return;
  }
  throw new Error(`Forbidden: missing one of [${perms.join(", ")}]`);
}

export async function requireRoleAtLeast(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  minRole: AppRole,
): Promise<void> {
  await requireOrgMembership(supabase, userId, organizationId, minRole);
}
