import { addonsForTier, type AddonId, type TierId } from "@/lib/hive-tiers";
import { requireOrgMembership } from "@/integrations/supabase/require-org";

/**
 * Server-side entitlement enforcement.
 *
 * UI locks (AddonLock / NectarInfusionLock) and the server check below must
 * agree — never trust the UI alone. Verifies the caller is an active member
 * of `organizationId`, reads THAT org's assigned tier from
 * `org_subscriptions`, and throws a 403-ish error if the requested add-on is
 * not included.
 *
 * Tier 3 Stage 3: the legacy `resolveCallerEntitlements` / `assertAddon`
 * helpers (which picked the caller's "primary" org via FIRST_MEMBERSHIP)
 * have been removed. Always pass the active org explicitly.
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
