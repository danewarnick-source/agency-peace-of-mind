import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addonsForTier, type AddonId, type TierId } from "@/lib/hive-tiers";

export interface MyEntitlements {
  organization_id: string | null;
  tier: TierId;
  status: string;
  addons: AddonId[];
}

/**
 * Returns the entitlements (tier + addons) for the current user's primary
 * organization. Used to drive feature gating (NECTAR Infusion, Internal
 * Audit, etc.) from the company's subscription tier — set by HIVE Executive
 * in Plans & Billing.
 */
export const getMyEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyEntitlements> => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("active", true);

    const rank: Record<string, number> = { super_admin: 0, admin: 1, manager: 2, employee: 3 };
    const sorted = [...((memberships ?? []) as Array<{ organization_id: string; role: string }>)].sort(
      (a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9),
    );
    const primary = sorted[0];
    if (!primary) {
      return { organization_id: null, tier: "starter", status: "trial", addons: [] };
    }

    const { data: sub } = await supabase
      .from("org_subscriptions")
      .select("plan, status")
      .eq("organization_id", primary.organization_id)
      .maybeSingle();

    const tier = ((sub?.plan as TierId) ?? "starter") as TierId;
    const status = (sub?.status as string) ?? "trial";
    return {
      organization_id: primary.organization_id,
      tier,
      status,
      addons: addonsForTier(tier),
    };
  });
