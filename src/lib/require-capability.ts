/**
 * Server-side capability gate.
 *
 * The pair to client-side `useOrgCapability`. Every server function that
 * exposes sensitive data (financials, PHI, PBA, section access, manage
 * actions) MUST call this — never rely on the UI hiding the surface.
 *
 * Fail-closed: any error from the DB resolver, missing membership, or
 * unknown capability collapses to "forbidden". Deny overrides always win,
 * even for super_admin (see `public.has_capability`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import type { Capability } from "@/lib/capabilities";

type AnySupabase = SupabaseClient<Database> | SupabaseClient;

export async function requireCapability(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  cap: Capability,
): Promise<void> {
  // Membership check first — keeps error messaging consistent and blocks
  // cross-tenant calls before we ever hit the resolver.
  await requireOrgMembership(supabase, userId, organizationId, "employee");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("has_capability", {
    _user_id: userId,
    _org_id: organizationId,
    _cap: cap,
  });

  if (error) throw new Error("Capability check failed");
  if (data !== true) throw new Error(`Forbidden: missing capability ${cap}`);
}

export async function requireAnyCapability(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  caps: Capability[],
): Promise<void> {
  await requireOrgMembership(supabase, userId, organizationId, "employee");
  for (const cap of caps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("has_capability", {
      _user_id: userId,
      _org_id: organizationId,
      _cap: cap,
    });
    if (error) throw new Error("Capability check failed");
    if (data === true) return;
  }
  throw new Error(`Forbidden: missing one of [${caps.join(", ")}]`);
}

/**
 * Non-throwing variant for conditional server logic (e.g. shape the payload
 * differently based on capability). Never leak forbidden data through this —
 * use it to decide what to include, not what to skip enforcement on.
 */
export async function hasCapability(
  supabase: AnySupabase,
  userId: string,
  organizationId: string,
  cap: Capability,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("has_capability", {
    _user_id: userId,
    _org_id: organizationId,
    _cap: cap,
  });
  if (error) return false;
  return data === true;
}
