import { addonsForTier, type AddonId, type TierId } from "@/lib/hive-tiers";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

/**
 * Server-side entitlement enforcement.
 *
 * UI locks (AddonLock / NectarInfusionLock) and the server check below must
 * agree — never trust the UI alone. Resolves the caller's primary
 * organization, reads its assigned tier from `org_subscriptions`, and throws
 * a 403-ish error if the requested add-on is not included.
 *
 * NOTE: This "primary org" resolver is the legacy FIRST_MEMBERSHIP pattern
 * and is wrong for multi-org users. Prefer `assertAddonForOrg(..., orgId)`
 * which checks the entitlement for the org actually passed by the caller.
 */
export async function resolveCallerEntitlements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ organizationId: string | null; tier: TierId; addons: AddonId[] }> {
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("active", true);

  const rank: Record<string, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3 };
  const sorted = [...((memberships ?? []) as Array<{ organization_id: string; role: string }>)]
    .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
  const primary = sorted[0];
  if (!primary) {
    return { organizationId: null, tier: "starter", addons: [] };
  }

  const { data: sub } = await supabase
    .from("org_subscriptions")
    .select("plan")
    .eq("organization_id", primary.organization_id)
    .maybeSingle();

  const tier = ((sub?.plan as TierId) ?? "starter") as TierId;
  return {
    organizationId: primary.organization_id,
    tier,
    addons: addonsForTier(tier),
  };
}

/**
 * @deprecated Uses the caller's primary org — wrong for multi-org users.
 * Use `assertAddonForOrg(supabase, userId, addon, organizationId)` instead.
 */
export async function assertAddon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  addon: AddonId,
): Promise<void> {
  const ent = await resolveCallerEntitlements(supabase, userId);
  if (!ent.addons.includes(addon)) {
    throw new Error(
      `Forbidden: this capability requires the "${addon}" add-on. Upgrade your plan to enable it.`,
    );
  }
}

/**
 * Org-scoped entitlement check.
 *
 * Tier 3 Stage 2: verifies the caller is an active member of `organizationId`,
 * then reads THAT organization's `org_subscriptions.plan` and confirms the
 * add-on is included. Replaces the legacy "primary org" check which was
 * incorrect for multi-org users.
 */
export async function assertAddonForOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  addon: AddonId,
  organizationId: string,
): Promise<void> {
  await requireOrgMembership(supabase, userId, organizationId, "employee");

  const { data: sub } = await supabase
    .from("org_subscriptions")
    .select("plan")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const tier = ((sub?.plan as TierId) ?? "starter") as TierId;
  const addons = addonsForTier(tier);
  if (!addons.includes(addon)) {
    throw new Error(
      `Forbidden: this capability requires the "${addon}" add-on. Upgrade your plan to enable it.`,
    );
  }
}
