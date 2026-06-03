// Shared server-side org membership guard.
//
// Tier 3 Stage 1: every org-scoped server fn should call requireOrgMembership(...)
// as the first line of its handler, BEFORE any read/write, so we verify the
// caller actually belongs to the organization they claim to act on. The
// existing "client sends organizationId" model is preserved — we only add
// VERIFICATION. RLS remains the backstop.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type AppRole = "employee" | "manager" | "admin" | "super_admin";

// Strictly ascending privilege ordering, mirroring the DB app_role enum
// and the existing has_org_role / is_org_admin_or_manager helpers.
const ROLE_RANK: Record<AppRole, number> = {
  employee: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(label: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}: not a UUID`);
  }
}

type AnySupabase = SupabaseClient<Database> | SupabaseClient;

async function checkMembership(
  client: AnySupabase,
  userId: string,
  organizationId: string,
  minRole: AppRole,
): Promise<void> {
  assertUuid("organizationId", organizationId);
  assertUuid("userId", userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("organization_members")
    .select("role, active")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    // Most commonly: RLS hides the row, which itself means "not a member".
    throw new Error("Not a member of this organization");
  }
  if (!data) {
    throw new Error("Not a member of this organization");
  }

  const role = data.role as AppRole | null;
  if (!role || !(role in ROLE_RANK)) {
    throw new Error("Not a member of this organization");
  }
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Error(
      `Insufficient role: requires ${minRole} or higher (have ${role})`,
    );
  }
}

/**
 * Verify the authenticated caller is an ACTIVE member of organizationId with
 * at least minRole. Uses the USER-scoped Supabase client so RLS also applies.
 *
 * Call this as the FIRST line of every org-scoped server fn handler.
 */
export async function requireOrgMembership(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  minRole: AppRole = "employee",
): Promise<void> {
  await checkMembership(supabase, userId, organizationId, minRole);
}

/**
 * Same check, but for handlers that legitimately use the admin client
 * (RLS bypassed). The membership query is performed explicitly because
 * RLS won't fence the admin client for us.
 */
export async function requireOrgMembershipAdmin(
  supabaseAdmin: AnySupabase,
  userId: string,
  organizationId: string,
  minRole: AppRole = "employee",
): Promise<void> {
  await checkMembership(supabaseAdmin, userId, organizationId, minRole);
}
