/**
 * After Stripe Checkout is paid, upsert org_subscriptions to status=active.
 * Confirm and the webhook share this writer so return-from-Checkout does
 * not wait on the webhook.
 *
 * Org/session reads use the signed-in client. The paid-row WRITE uses only
 * supabaseAdmin (SUPABASE_SERVICE_ROLE_KEY). Org admin RLS is SELECT-only —
 * a session upsert is always denied. True North is never given a paid row.
 * No PHI in logs. No new env names.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isBillingExempt } from "@/lib/billing-access";
import { readSupabaseAdminEnv } from "@/lib/supabase-public-env";
import {
  paidOrgSubscriptionCore,
  paidOrgSubscriptionPatch,
  type ActivatePaidSubscriptionInput,
} from "@/lib/org-subscription-row";

export const PAID_SUBSCRIPTION_WRITE_FAILED =
  "Payment went through. This host could not save the paid subscription row. Stay on this page.";

export const PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE =
  "Payment went through. This host is missing SUPABASE_SERVICE_ROLE_KEY, so the paid subscription row cannot be saved. Add SUPABASE_SERVICE_ROLE_KEY on this Vercel Preview and stay on this page.";

export {
  canWritePaidSubscriptionPrivileged,
  paidOrgSubscriptionCore,
  paidOrgSubscriptionPatch,
  type ActivatePaidSubscriptionInput,
} from "@/lib/org-subscription-row";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readOrgForExempt(db: any, orgId: string): Promise<boolean | null> {
  const full = await db
    .from("organizations")
    .select("id, name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  if (!full.error && full.data) {
    const row = full.data as {
      id?: string;
      name: string | null;
      legal_name: string | null;
      dba_name: string | null;
      billing_exempt?: boolean;
    };
    return isBillingExempt({
      billingExempt: row.billing_exempt === true,
      orgName: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      organizationId: row.id ?? orgId,
    });
  }
  const fallback = await db
    .from("organizations")
    .select("id, name, legal_name, dba_name")
    .eq("id", orgId)
    .maybeSingle();
  if (fallback.error || !fallback.data) return null;
  const row = fallback.data as {
    id?: string;
    name: string | null;
    legal_name: string | null;
    dba_name: string | null;
  };
  return isBillingExempt({
    billingExempt: false,
    orgName: row.name,
    legalName: row.legal_name,
    dbaName: row.dba_name,
    organizationId: row.id ?? orgId,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readPaidRow(db: any, orgId: string): Promise<{ status: string | null; locked_at: string | null } | null> {
  const { data } = await db
    .from("org_subscriptions")
    .select("status, locked_at")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: (data.status as string | null) ?? null,
    locked_at: (data.locked_at as string | null) ?? null,
  };
}

function isUnknownColumnError(message: string): boolean {
  return /column|schema cache|could not find/i.test(message);
}

function requireAdminWriter(): unknown {
  if (!readSupabaseAdminEnv()) {
    throw new Error(PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE);
  }
  return supabaseAdmin;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertPaidRow(db: any, opts: ActivatePaidSubscriptionInput): Promise<void> {
  const patch = paidOrgSubscriptionPatch(opts);
  const fullRow = { organization_id: opts.orgId, ...patch };
  const full = await db.from("org_subscriptions").upsert(fullRow, { onConflict: "organization_id" });
  if (!full.error) return;
  const msg = String(full.error.message ?? "");
  if (!isUnknownColumnError(msg)) {
    throw new Error(msg || PAID_SUBSCRIPTION_WRITE_FAILED);
  }
  const core = await db
    .from("org_subscriptions")
    .upsert(paidOrgSubscriptionCore(opts.orgId, patch), { onConflict: "organization_id" });
  if (core.error) {
    throw new Error(String(core.error.message ?? "") || PAID_SUBSCRIPTION_WRITE_FAILED);
  }
}

/**
 * Idempotent paid-row write. Confirm and webhook both call this.
 * sessionClient is read-only (org / TNS check). The upsert uses admin only.
 * @returns true when a paid row was written; false when the org is exempt (TNS).
 */
export async function activateSubscriptionFromCheckout(
  opts: ActivatePaidSubscriptionInput,
  sessionClient?: unknown,
): Promise<boolean> {
  if (sessionClient) {
    try {
      const exempt = await readOrgForExempt(sessionClient, opts.orgId);
      if (exempt === true) {
        console.warn("[checkout] skip paid subscription write", { code: "exempt_org" });
        return false;
      }
    } catch {
      /* admin write still runs for non-TNS; TNS is also checked below */
    }
  }

  const admin = requireAdminWriter();

  if (!sessionClient) {
    try {
      const exempt = await readOrgForExempt(admin, opts.orgId);
      if (exempt === true) {
        console.warn("[checkout] skip paid subscription write", { code: "exempt_org" });
        return false;
      }
    } catch {
      /* continue — webhook already skipped known exempt orgs */
    }
  }

  try {
    await upsertPaidRow(admin, opts);
  } catch (e) {
    const message = e instanceof Error ? e.message : PAID_SUBSCRIPTION_WRITE_FAILED;
    if (/SUPABASE_SERVICE_ROLE_KEY/i.test(message)) {
      throw new Error(PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE);
    }
    console.warn("[checkout] paid subscription upsert failed", { code: "sub_upsert" });
    throw new Error(message || PAID_SUBSCRIPTION_WRITE_FAILED);
  }

  const row = await readPaidRow(admin, opts.orgId);
  if ((row?.status ?? "").toLowerCase() !== "active" || row?.locked_at) {
    throw new Error(PAID_SUBSCRIPTION_WRITE_FAILED);
  }

  try {
    const { recordPaymentSuccess } = await import("@/lib/billing-lockout.server");
    await recordPaymentSuccess(opts.orgId, opts.amountCents, opts.eventId);
  } catch {
    console.warn("[checkout] payment event write skipped", { code: "pay_event" });
  }
  return true;
}
