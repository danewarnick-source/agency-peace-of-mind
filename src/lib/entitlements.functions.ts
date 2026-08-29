import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { entitlementsForOrg, isBillingExempt } from "@/lib/billing-access";
import type { AddonId, TierId } from "@/lib/hive-tiers";

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
    if (!supabase || !userId) {
      return { organization_id: null, tier: "starter", status: "trial", addons: [] };
    }

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("active", true);

    const rank: Record<string, number> = { admin: 0, program_manager: 1, manager: 2, employee: 3 };
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

    let billingExempt = false;
    const orgFull = await supabase
      .from("organizations")
      .select("name, legal_name, dba_name, billing_exempt")
      .eq("id", primary.organization_id)
      .maybeSingle();
    const org = orgFull.error
      ? (await supabase
          .from("organizations")
          .select("name, legal_name, dba_name")
          .eq("id", primary.organization_id)
          .maybeSingle()).data
      : orgFull.data;
    if (org) {
      billingExempt = isBillingExempt({
        billingExempt: (org as { billing_exempt?: boolean }).billing_exempt === true,
        orgName: org.name,
        legalName: (org as { legal_name?: string | null }).legal_name,
        dbaName: (org as { dba_name?: string | null }).dba_name,
      });
    }

    const { tier, addons } = entitlementsForOrg({
      billingExempt,
      plan: (sub?.plan as string | null) ?? null,
    });
    const status = billingExempt ? "active" : ((sub?.status as string) ?? "paused");
    return {
      organization_id: primary.organization_id,
      tier,
      status,
      addons,
    };
  });
