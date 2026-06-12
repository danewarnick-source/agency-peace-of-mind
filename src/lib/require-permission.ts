// Server-side permission gate. Mirrors client `can(perm)` but enforces in the
// server fn boundary using the SECURITY DEFINER `public.has_permission()` DB
// function (see migration 20260612053405). Throws so the server fn returns
// 500/403 to the caller — never silently passes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireOrgMembership, type AppRole } from "@/integrations/supabase/require-org";

type AnySupabase = SupabaseClient<Database> | SupabaseClient;

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
  if (data !== true) throw new Error(`Forbidden: missing permission ${perm}`);
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
