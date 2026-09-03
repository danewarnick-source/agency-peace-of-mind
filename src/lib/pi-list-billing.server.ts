/**
 * Platform-owned PI list quantity. High-water client count → Stripe.
 * Do not log names, emails, or other PHI.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isBillingExempt } from "@/lib/billing-access";
import {
  countBillableClients,
  dropRenewalCredit,
  leftoverAddInvoice,
  leftoverMonths,
  periodFromIsoRange,
  prepaidYearKeepsAccess,
  yearlyDiscountForInterval,
  type BillableClientRow,
  type BillingPeriod,
} from "@/lib/pi-client-billing";
import { quotePiListSubscription } from "@/lib/pi-signup-pricing";
import { readStripeEnv, subscriptionLineItemsForPiListQuote } from "@/lib/stripe-config";
import { getStripe } from "@/lib/stripe.server";

type OrgSubRow = {
  id: string;
  organization_id: string;
  status: string | null;
  billing_interval: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  billed_client_count?: number | null;
  renewal_credit_cents?: number | null;
  cancel_at_period_end?: boolean | null;
};

async function loadOrgForBilling(orgId: string): Promise<{
  exempt: boolean;
  name: string;
} | null> {
  const full = await supabaseAdmin
    .from("organizations")
    .select("id, name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  const row = (full.data ??
    (
      await supabaseAdmin.from("organizations").select("id, name, legal_name, dba_name").eq("id", orgId).maybeSingle()
    ).data) as {
    id: string;
    name: string;
    legal_name?: string | null;
    dba_name?: string | null;
    billing_exempt?: boolean;
  } | null;
  if (!row) return null;
  return {
    name: row.name,
    exempt: isBillingExempt({
      billingExempt: row.billing_exempt === true,
      orgName: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      organizationId: orgId,
    }),
  };
}

export async function loadBillableClientRows(orgId: string): Promise<BillableClientRow[]> {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("created_at, discharge_date")
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as BillableClientRow[]).map((row) => ({
    created_at: row.created_at,
    discharge_date: row.discharge_date ?? null,
  }));
}

export async function highWaterClientCount(
  orgId: string,
  period?: BillingPeriod,
  now: Date = new Date(),
): Promise<{ count: number; period: BillingPeriod }> {
  const { data: sub } = await supabaseAdmin
    .from("org_subscriptions")
    .select("current_period_start, current_period_end")
    .eq("organization_id", orgId)
    .maybeSingle();
  const resolved =
    period ??
    periodFromIsoRange(
      (sub as { current_period_start?: string | null } | null)?.current_period_start,
      (sub as { current_period_end?: string | null } | null)?.current_period_end,
      now,
    );
  const rows = await loadBillableClientRows(orgId);
  return { count: countBillableClients(rows, resolved), period: resolved };
}

function ignoreMissingBillingColumn(message: string | undefined): boolean {
  return /billed_client_count|billed_period_start|billed_period_end|renewal_credit_cents/i.test(message ?? "");
}

async function patchSubscriptionBilling(
  subId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin.from("org_subscriptions").update(patch).eq("id", subId);
  if (error && !ignoreMissingBillingColumn(error.message)) {
    throw new Error(error.message);
  }
}

async function applyRenewalCreditToInvoice(opts: {
  customerId: string;
  invoiceId: string;
  creditCents: number;
}): Promise<void> {
  if (opts.creditCents <= 0) return;
  const stripe = getStripe();
  await stripe.invoiceItems.create({
    customer: opts.customerId,
    invoice: opts.invoiceId,
    amount: -opts.creditCents,
    currency: "usd",
    description: "Unused prepaid client time — credit at renewal. No cash refund.",
  });
}

async function invoiceLeftoverAdd(opts: {
  customerId: string;
  invoiceCents: number;
  addedClients: number;
  leftoverMonths: number;
}): Promise<void> {
  if (opts.invoiceCents <= 0) return;
  const stripe = getStripe();
  await stripe.invoiceItems.create({
    customer: opts.customerId,
    amount: opts.invoiceCents,
    currency: "usd",
    description: `Provider Interface — ${opts.addedClients} added client(s) for ${opts.leftoverMonths} leftover month(s)`,
  });
  const invoice = await stripe.invoices.create({
    customer: opts.customerId,
    auto_advance: true,
    metadata: { hive_kind: "pi_list_leftover_add" },
  });
  if (invoice.id && invoice.status === "draft") {
    await stripe.invoices.finalizeInvoice(invoice.id);
  }
}

async function syncStripeSubscriptionItems(opts: {
  subscriptionId: string;
  clientCount: number;
}): Promise<void> {
  const stripe = getStripe();
  const env = readStripeEnv();
  const quote = quotePiListSubscription({ clientCount: opts.clientCount });
  const desired = subscriptionLineItemsForPiListQuote(quote, null, env).lineItems[0];
  if (!desired) return;

  const sub = await stripe.subscriptions.retrieve(opts.subscriptionId, { expand: ["items.data.price"] });
  const items = sub.items.data.filter((item) => {
    const interval = item.price?.recurring?.interval;
    return interval === "month" || interval === "year";
  });
  const desiredPrice = desired.price ?? null;
  const desiredQty = desired.quantity;

  const matching = desiredPrice ? items.find((item) => item.price?.id === desiredPrice) : null;
  const updates: Array<{ id?: string; price?: string; quantity?: number; deleted?: boolean }> = [];

  if (matching) {
    if (matching.quantity !== desiredQty) {
      updates.push({ id: matching.id, quantity: desiredQty });
    }
    for (const item of items) {
      if (item.id !== matching.id) updates.push({ id: item.id, deleted: true });
    }
  } else if (desiredPrice) {
    updates.push({ price: desiredPrice, quantity: desiredQty });
    for (const item of items) {
      updates.push({ id: item.id, deleted: true });
    }
  } else {
    return;
  }

  if (updates.length === 0) return;
  await stripe.subscriptions.update(opts.subscriptionId, {
    items: updates,
    proration_behavior: "none",
    metadata: {
      ...(sub.metadata ?? {}),
      hive_kind: "subscription",
      pricing_model: "pi_list",
      client_count: String(opts.clientCount),
      monthly_cents: String(quote.monthlyCents),
    },
  });
}

export async function syncPiListQuantityForOrg(
  orgId: string,
  opts?: { invoiceId?: string | null; now?: Date; allowLeftoverInvoice?: boolean },
): Promise<{
  skipped: boolean;
  reason?: string;
  clientCount?: number;
  monthlyCents?: number;
}> {
  const org = await loadOrgForBilling(orgId);
  if (!org) return { skipped: true, reason: "org_not_found" };
  if (org.exempt) return { skipped: true, reason: "billing_exempt" };

  const { data: sub } = await supabaseAdmin
    .from("org_subscriptions")
    .select(
      "id, organization_id, status, billing_interval, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, billed_client_count, renewal_credit_cents, cancel_at_period_end",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!sub) return { skipped: true, reason: "no_subscription" };

  const row = sub as OrgSubRow;
  const now = opts?.now ?? new Date();
  const { count, period } = await highWaterClientCount(orgId, undefined, now);
  const quote = quotePiListSubscription({ clientCount: count });
  const previous = typeof row.billed_client_count === "number" ? row.billed_client_count : null;
  const interval = row.billing_interval === "annual" ? "annual" : "monthly";
  const discount = yearlyDiscountForInterval(interval);
  const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;

  if (row.stripe_subscription_id) {
    await syncStripeSubscriptionItems({
      subscriptionId: row.stripe_subscription_id,
      clientCount: count,
    });
  }

  if (
    opts?.allowLeftoverInvoice !== false &&
    interval === "annual" &&
    previous != null &&
    count > previous &&
    row.stripe_customer_id &&
    periodEnd
  ) {
    const leftover = leftoverAddInvoice({
      previousCount: previous,
      nextCount: count,
      leftoverMonths: leftoverMonths(now, periodEnd),
      yearlyDiscount: discount,
    });
    await invoiceLeftoverAdd({
      customerId: row.stripe_customer_id,
      invoiceCents: leftover.invoiceCents,
      addedClients: leftover.addedClients,
      leftoverMonths: leftover.leftoverMonths,
    });
  }

  let renewalCredit = row.renewal_credit_cents ?? 0;
  if (interval === "annual" && previous != null && count < previous && periodEnd) {
    const credit = dropRenewalCredit({
      previousCount: previous,
      nextCount: count,
      leftoverMonths: leftoverMonths(now, periodEnd),
      yearlyDiscount: discount,
    });
    renewalCredit += credit.creditCents;
  }

  if (opts?.invoiceId && row.stripe_customer_id && renewalCredit > 0) {
    await applyRenewalCreditToInvoice({
      customerId: row.stripe_customer_id,
      invoiceId: opts.invoiceId,
      creditCents: renewalCredit,
    });
    renewalCredit = 0;
  }

  await patchSubscriptionBilling(row.id, {
    billed_client_count: count,
    billed_period_start: period.start,
    billed_period_end: period.end,
    renewal_credit_cents: renewalCredit,
    mrr_cents: quote.monthlyCents,
  });

  return { skipped: false, clientCount: count, monthlyCents: quote.monthlyCents };
}

export async function syncPiListQuantitiesForActiveOrgs(now: Date = new Date()): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("organization_id, status, stripe_subscription_id")
    .in("status", ["active", "past_due", "paused"]);
  if (error) throw new Error(error.message);

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  for (const row of data ?? []) {
    const orgId = (row as { organization_id: string }).organization_id;
    try {
      const result = await syncPiListQuantityForOrg(orgId, { now });
      if (result.skipped) skipped += 1;
      else synced += 1;
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : "sync_failed";
      console.error("[pi-list-billing] quantity sync failed", { error: msg });
    }
  }
  return { synced, skipped, errors };
}

export function shouldKeepPrepaidAccess(row: {
  billing_interval?: string | null;
  current_period_end?: string | null;
}): boolean {
  return prepaidYearKeepsAccess({
    interval: row.billing_interval,
    periodEndIso: row.current_period_end,
  });
}
