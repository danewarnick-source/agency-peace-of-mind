/**
 * Paid org_subscriptions row shape. Pure — no I/O.
 * Confirm and webhook apply this patch after Stripe says paid.
 */

import { normalizeTierId } from "./hive-tiers.ts";
import { mrrCentsForPlan } from "./stripe-config.ts";

export type ActivatePaidSubscriptionInput = {
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
};

export type PaidSubscriptionPatch = {
  plan: string;
  status: "active";
  mrr_cents: number;
  billing_interval: "monthly" | "annual";
  staff_count?: number;
  current_period_start: string;
  current_period_end: string;
  renewal_date: string;
  started_at: string;
  past_due_since: null;
  locked_at: null;
  lock_reason: null;
  failure_count: 0;
  last_payment_error: null;
  last_payment_attempt_at: string;
  cancel_at_period_end: false;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

export function paidOrgSubscriptionPatch(opts: ActivatePaidSubscriptionInput): PaidSubscriptionPatch {
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
  const nowIso = new Date().toISOString();
  return {
    plan,
    status: "active",
    mrr_cents: monthly,
    billing_interval: opts.billingInterval ?? "monthly",
    ...(opts.staffCount && opts.staffCount > 0 ? { staff_count: opts.staffCount } : {}),
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
}

/** Columns that exist on the original org_subscriptions table + Stripe ids. */
export function paidOrgSubscriptionCore(
  orgId: string,
  patch: PaidSubscriptionPatch,
): Record<string, unknown> {
  return {
    organization_id: orgId,
    plan: patch.plan,
    status: "active",
    mrr_cents: patch.mrr_cents,
    started_at: patch.started_at,
    renewal_date: patch.renewal_date,
    locked_at: null,
    lock_reason: null,
    stripe_customer_id: patch.stripe_customer_id,
    stripe_subscription_id: patch.stripe_subscription_id,
  };
}

/** True only when the existing service-role name is set. URL may be VITE_. */
export function canWritePaidSubscriptionPrivileged(
  env?: Record<string, string | undefined>,
): boolean {
  const source = env ?? (typeof process !== "undefined" ? process.env : {});
  const url = source.VITE_SUPABASE_URL || source.SUPABASE_URL;
  const serviceRole = source.SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && serviceRole);
}
