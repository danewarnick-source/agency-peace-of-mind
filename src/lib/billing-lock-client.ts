/**
 * Client-side unpaid-org lock. beforeLoad skips on SSR (no window/session),
 * so DashboardLayout also runs this after hydrate. Same rules as orgAccessIsLocked.
 */

import { supabase } from "@/integrations/supabase/client";
import { orgAccessIsLocked } from "@/lib/billing-access";

export const BILLING_LOCK_ALLOWLIST = [
  "/dashboard/billing/subscription",
  "/dashboard/settings/subscription",
];

export function pathBypassesBillingLock(pathname: string, isAdmin: boolean): boolean {
  if (pathname.startsWith("/dashboard/hive-exec")) return true;
  if (
    isAdmin &&
    BILLING_LOCK_ALLOWLIST.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return true;
  }
  return false;
}

export async function orgDashboardIsLocked(opts: {
  userId: string;
  activeOrgId?: string | null;
}): Promise<{ locked: boolean; isAdmin: boolean; orgId: string | null }> {
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", opts.userId)
    .eq("active", true);
  if (!memberships || memberships.length === 0) {
    return { locked: false, isAdmin: false, orgId: null };
  }

  const membership =
    memberships.find((m) => m.organization_id === opts.activeOrgId) ?? memberships[0];
  const orgId = membership.organization_id;
  const isAdmin = membership.role === "admin";

  const { data: sub } = await supabase
    .from("org_subscriptions")
    .select("locked_at, status, stripe_subscription_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let orgRow: {
    name?: string;
    legal_name?: string | null;
    dba_name?: string | null;
    billing_exempt?: boolean;
  } | null = null;
  const orgFull = await supabase
    .from("organizations")
    .select("name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  if (orgFull.error) {
    const retry = await supabase
      .from("organizations")
      .select("name, legal_name, dba_name")
      .eq("id", orgId)
      .maybeSingle();
    orgRow = retry.data;
  } else {
    orgRow = orgFull.data;
  }

  const locked = orgAccessIsLocked({
    billingExempt: orgRow?.billing_exempt === true,
    orgName: orgRow?.name ?? null,
    legalName: orgRow?.legal_name,
    dbaName: orgRow?.dba_name,
    organizationId: orgId,
    subscription: sub
      ? {
          status: sub.status,
          locked_at: sub.locked_at,
          stripe_subscription_id: (sub as { stripe_subscription_id?: string | null })
            .stripe_subscription_id,
        }
      : null,
  });

  return { locked, isAdmin, orgId };
}
