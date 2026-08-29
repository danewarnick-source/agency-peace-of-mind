/**
 * Stripe webhook application logic (after signature verification).
 * Idempotent via payment_events.stripe_event_id.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  lockAccount,
  recordPaymentFailure,
  recordPaymentSuccess,
  unlockAccount,
} from "@/lib/billing-lockout.server";
import { isBillingExempt, UNPAID_LOCK_REASON } from "@/lib/billing-access";
import { mrrCentsForPlan } from "@/lib/stripe-config";
import { fulfillTrainingOrder } from "@/lib/training-fulfillment.server";
import { normalizeTierId } from "@/lib/hive-tiers";

export type StripeLikeEvent = {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> | null };
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function metadataOf(obj: Record<string, unknown>): Record<string, string> {
  const m = obj.metadata;
  if (!m || typeof m !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function orgIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabaseAdmin
    .from("org_subscriptions")
    .select("organization_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}

async function loadExempt(orgId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) {
    // Column may not exist until SQL handoff is applied.
    const { data: fallback } = await supabaseAdmin
      .from("organizations")
      .select("name, legal_name, dba_name")
      .eq("id", orgId)
      .maybeSingle();
    if (!fallback) return false;
    return isBillingExempt({
      billingExempt: false,
      orgName: fallback.name,
      legalName: (fallback as { legal_name?: string | null }).legal_name,
      dbaName: (fallback as { dba_name?: string | null }).dba_name,
    });
  }
  const row = data as {
    name: string;
    legal_name: string | null;
    dba_name: string | null;
    billing_exempt?: boolean;
  };
  return isBillingExempt({
    billingExempt: row.billing_exempt === true,
    orgName: row.name,
    legalName: row.legal_name,
    dbaName: row.dba_name,
  });
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("payment_events")
    .select("id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return !!data;
}

export async function activateSubscriptionFromCheckout(opts: {
  orgId: string;
  plan: string;
  customerId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  amountCents: number;
  periodEndIso: string | null;
  eventId: string | null;
  staffCount?: number | null;
  billingInterval?: "monthly" | "annual" | null;
  monthlyCents?: number | null;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const plan = opts.plan === "hive_standard" ? "hive_standard" : normalizeTierId(opts.plan);
  const monthly =
    opts.monthlyCents && opts.monthlyCents > 0
      ? opts.monthlyCents
      : opts.billingInterval === "annual" && opts.amountCents > 0
        ? Math.round(opts.amountCents / 12)
        : opts.amountCents || mrrCentsForPlan(plan);
  const periodEnd =
    opts.periodEndIso ??
    new Date(Date.now() + (opts.billingInterval === "annual" ? 365 : 30) * 86_400_000).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("org_subscriptions")
    .select("id")
    .eq("organization_id", opts.orgId)
    .maybeSingle();

  const patch = {
    plan,
    status: "active" as const,
    mrr_cents: monthly,
    billing_interval: opts.billingInterval ?? "monthly",
    staff_count: opts.staffCount && opts.staffCount > 0 ? opts.staffCount : undefined,
    current_period_start: nowIso,
    current_period_end: periodEnd,
    renewal_date: periodEnd.slice(0, 10),
    started_at: nowIso,
    past_due_since: null,
    locked_at: null,
    lock_reason: null,
    failure_count: 0,
    last_payment_error: null,
    last_payment_attempt_at: nowIso,
    cancel_at_period_end: false,
    stripe_customer_id: opts.customerId,
    stripe_subscription_id: opts.subscriptionId,
  };

  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

  if (existing) {
    const { error } = await supabaseAdmin.from("org_subscriptions").update(cleanPatch).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("org_subscriptions").insert({
      organization_id: opts.orgId,
      ...cleanPatch,
    });
    if (error) throw new Error(error.message);
  }

  await recordPaymentSuccess(opts.orgId, opts.amountCents, opts.eventId);
}

export async function handleVerifiedStripeEvent(event: StripeLikeEvent): Promise<{ ok: true }> {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const meta = metadataOf(obj);
  const customerId = asString(obj.customer);
  const eventId = event.id;

  if (await alreadyProcessed(eventId)) return { ok: true };

  switch (event.type) {
    case "checkout.session.completed": {
      const hiveKind = meta.hive_kind ?? (obj.mode === "payment" && meta.catalog_id ? "training" : "subscription");
      const orgId = meta.organization_id || (await orgIdFromCustomer(customerId));
      if (hiveKind === "training") {
        if (!meta.hive_order_id || !meta.catalog_id || !orgId) break;
        await fulfillTrainingOrder({
          orderId: meta.hive_order_id,
          catalogId: meta.catalog_id,
          organizationId: orgId,
          modeContext: meta.mode_context === "individual" ? "individual" : "bulk_seats",
          quantity: Number(meta.quantity ?? "1") || 1,
          assigneeUserId: meta.assignee_user_id || null,
          stripeSessionId: asString(obj.id),
          stripePaymentIntentId: asString(obj.payment_intent),
          stripeCustomerId: customerId,
          amountCents: typeof obj.amount_total === "number" ? obj.amount_total : 0,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin as any).from("payment_events").insert({
          org_id: orgId,
          event_type: "payment_succeeded",
          amount_cents: typeof obj.amount_total === "number" ? obj.amount_total : 0,
          stripe_event_id: eventId,
          metadata: { hive_kind: "training", hive_order_id: meta.hive_order_id },
        });
        break;
      }

      if (!orgId) break;
      if (await loadExempt(orgId)) {
        await unlockAccount(orgId).catch(() => undefined);
        break;
      }
      const periodEndUnix = typeof obj.current_period_end === "number" ? obj.current_period_end : null;
      await activateSubscriptionFromCheckout({
        orgId,
        plan: meta.plan || "hive_standard",
        customerId,
        subscriptionId: asString(obj.subscription),
        paymentIntentId: asString(obj.payment_intent),
        amountCents: typeof obj.amount_total === "number" ? obj.amount_total : Number(meta.monthly_cents ?? 0),
        periodEndIso: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
        eventId,
        staffCount: Number(meta.staff_count ?? 0) || null,
        billingInterval: meta.interval === "annual" ? "annual" : "monthly",
        monthlyCents: Number(meta.monthly_cents ?? 0) || null,
      });
      break;
    }

    case "customer.subscription.updated": {
      const orgId = meta.organization_id || (await orgIdFromCustomer(customerId));
      if (!orgId) break;
      if (await loadExempt(orgId)) break;
      const status = asString(obj.status) ?? "";
      const subId = asString(obj.id);
      const periodEnd =
        typeof obj.current_period_end === "number"
          ? new Date(obj.current_period_end * 1000).toISOString()
          : null;
      const { data: row } = await supabaseAdmin
        .from("org_subscriptions")
        .select("id")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (row) {
        const mapped =
          status === "active" || status === "trialing"
            ? "active"
            : status === "past_due"
              ? "past_due"
              : status === "canceled" || status === "unpaid"
                ? "canceled"
                : status === "paused"
                  ? "paused"
                  : undefined;
        await supabaseAdmin
          .from("org_subscriptions")
          .update({
            ...(mapped ? { status: mapped } : {}),
            stripe_subscription_id: subId,
            stripe_customer_id: customerId,
            ...(periodEnd
              ? { current_period_end: periodEnd, renewal_date: periodEnd.slice(0, 10) }
              : {}),
          })
          .eq("id", row.id);
      }
      if (status === "active" || status === "trialing") {
        await recordPaymentSuccess(orgId, 0, eventId);
      } else if (status === "past_due" || status === "unpaid") {
        await recordPaymentFailure(orgId, `Stripe subscription ${status}`, eventId);
      } else if (status === "canceled") {
        await lockAccount(orgId, "Subscription cancelled in Stripe");
      }
      break;
    }

    case "customer.subscription.deleted": {
      const orgId = meta.organization_id || (await orgIdFromCustomer(customerId));
      if (!orgId) break;
      if (await loadExempt(orgId)) break;
      await lockAccount(orgId, "Subscription cancelled in Stripe");
      break;
    }

    case "invoice.payment_failed": {
      const orgId = meta.organization_id || (await orgIdFromCustomer(customerId));
      if (!orgId) break;
      if (await loadExempt(orgId)) break;
      const reason =
        (obj.last_finalization_error as { message?: string } | undefined)?.message ??
        "invoice.payment_failed";
      await recordPaymentFailure(orgId, reason, eventId);
      break;
    }

    case "invoice.payment_succeeded": {
      const orgId = meta.organization_id || (await orgIdFromCustomer(customerId));
      if (!orgId) break;
      const amount = Number(obj.amount_paid ?? obj.amount_due ?? 0);
      await recordPaymentSuccess(orgId, amount, eventId);
      break;
    }

    default:
      break;
  }

  return { ok: true };
}

export { UNPAID_LOCK_REASON };
