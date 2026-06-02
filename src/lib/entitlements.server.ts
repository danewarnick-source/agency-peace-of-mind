import { addonsForTier, type AddonId, type TierId } from "@/lib/hive-tiers";

/**
 * Server-side entitlement enforcement.
 *
 * UI locks (AddonLock / NectarInfusionLock) and the server check below must
 * agree — never trust the UI alone. Resolves the caller's primary
 * organization, reads its assigned tier from `org_subscriptions`, and throws
 * a 403-ish error if the requested add-on is not included.
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
 * Throw if the caller's tier does not include `addon`. Use at the top of
 * server-fn handlers that back a tier-gated capability so the lock cannot be
 * bypassed by calling the endpoint directly.
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
