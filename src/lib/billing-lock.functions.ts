/**
 * Server-side billing lock. Reads org_subscriptions with the admin client so
 * a just-paid active row is visible even when browser RLS hides the table
 * (org admin/manager SELECT only) or the client REST call errors.
 *
 * No PHI in logs. True North stays unlocked via isBillingExempt.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isBillingExempt, orgAccessIsLocked } from "@/lib/billing-access";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type LockOrgRow = {
  name: string | null;
  legalName: string | null;
  dbaName: string | null;
  billingExempt: boolean;
};

async function loadLockOrg(orgId: string): Promise<LockOrgRow | null> {
  const full = await supabaseAdmin
    .from("organizations")
    .select("name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  if (!full.error && full.data) {
    const row = full.data as {
      name: string | null;
      legal_name: string | null;
      dba_name: string | null;
      billing_exempt?: boolean;
    };
    return {
      name: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      billingExempt: row.billing_exempt === true,
    };
  }
  const fallback = await supabaseAdmin
    .from("organizations")
    .select("name, legal_name, dba_name")
    .eq("id", orgId)
    .maybeSingle();
  if (fallback.error || !fallback.data) return null;
  const row = fallback.data as {
    name: string | null;
    legal_name: string | null;
    dba_name: string | null;
  };
  return {
    name: row.name,
    legalName: row.legal_name,
    dbaName: row.dba_name,
    billingExempt: false,
  };
}

export const getBillingLockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { organizationId?: string | null }) => {
    const organizationId = String(input?.organizationId ?? "");
    return { organizationId: UUID_RE.test(organizationId) ? organizationId : "" };
  })
  .handler(async ({ data, context }) => {
    const empty = {
      locked: false,
      isAdmin: false,
      orgId: null as string | null,
      status: null as string | null,
      billingExempt: false,
    };
    if (!context.supabase || !context.userId) return empty;

    const { data: memberships } = await context.supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", context.userId)
      .eq("active", true);
    const ms = (memberships ?? []) as Array<{ organization_id: string; role: string }>;
    if (ms.length === 0) return empty;

    const orgId =
      (data.organizationId && ms.some((m) => m.organization_id === data.organizationId)
        ? data.organizationId
        : null) ?? ms[0].organization_id;
    const membership = ms.find((m) => m.organization_id === orgId) ?? ms[0];
    const isAdmin = membership.role === "admin";

    const org = await loadLockOrg(orgId);
    if (!org) {
      return { locked: true, isAdmin, orgId, status: null, billingExempt: false };
    }

    const { data: sub } = await supabaseAdmin
      .from("org_subscriptions")
      .select("status, locked_at, stripe_subscription_id")
      .eq("organization_id", orgId)
      .maybeSingle();

    const billingExempt = isBillingExempt({
      billingExempt: org.billingExempt,
      orgName: org.name,
      legalName: org.legalName,
      dbaName: org.dbaName,
      organizationId: orgId,
    });
    const locked = orgAccessIsLocked({
      billingExempt,
      orgName: org.name,
      legalName: org.legalName,
      dbaName: org.dbaName,
      organizationId: orgId,
      subscription: sub
        ? {
            status: (sub.status as string | null) ?? null,
            locked_at: (sub.locked_at as string | null) ?? null,
            stripe_subscription_id:
              (sub as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null,
          }
        : null,
    });

    return {
      locked,
      isAdmin,
      orgId,
      status: (sub?.status as string | null) ?? null,
      billingExempt,
    };
  });
