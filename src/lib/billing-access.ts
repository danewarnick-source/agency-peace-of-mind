/**
 * Pure billing-access rules. No I/O — unit-tested.
 *
 * Source of truth for "does this company have to pay?" and "is the dashboard locked?"
 * True North Supports is never charged: billing_exempt on the org, with a name
 * fallback so TNS still works if the SQL handoff has not been run yet.
 */

import { addonsForTier, getTier, normalizeTierId, type AddonId, type TierId } from "./hive-tiers.ts";

export type SubscriptionGate = {
  status: string | null;
  locked_at: string | null;
  stripe_subscription_id?: string | null;
};

export type BillingGateInput = {
  billingExempt: boolean | null | undefined;
  orgName: string | null | undefined;
  legalName?: string | null;
  dbaName?: string | null;
  subscription: SubscriptionGate | null;
};

export function orgLooksLikeTrueNorth(names: Array<string | null | undefined>): boolean {
  return names.some((n) => (n ?? "").toLowerCase().includes("true north supports"));
}

export function isBillingExempt(input: Pick<BillingGateInput, "billingExempt" | "orgName" | "legalName" | "dbaName">): boolean {
  if (input.billingExempt === true) return true;
  return orgLooksLikeTrueNorth([input.orgName, input.legalName, input.dbaName]);
}

/**
 * Unpaid / cancelled companies cannot use the dashboard.
 * Exempt orgs (True North, or anyone Hive Exec marked comped) never lock.
 *
 * Missing subscription row = unpaid new agency (fail closed).
 * locked_at set = locked.
 * paused without a Stripe subscription id = waiting on first Checkout.
 * trial is not a real product state — treat as unpaid.
 * past_due stays usable until lockAccount runs (30-day dunning).
 */
export function orgAccessIsLocked(input: BillingGateInput): boolean {
  if (isBillingExempt(input)) return false;
  const sub = input.subscription;
  if (!sub) return true;
  if (sub.locked_at) return true;
  const status = (sub.status ?? "").toLowerCase();
  if (status === "canceled" || status === "cancelled") return true;
  if (status === "paused" && !sub.stripe_subscription_id) return true;
  if (status === "trial") return true;
  return false;
}

export function entitlementsForOrg(opts: {
  billingExempt: boolean;
  plan: string | null | undefined;
}): { tier: TierId; addons: AddonId[] } {
  if (opts.billingExempt) {
    const tier = getTier("enterprise");
    return { tier: tier.id, addons: tier.addons };
  }
  const tier = normalizeTierId(opts.plan);
  return { tier, addons: addonsForTier(tier) };
}

/**
 * Extra HIVE Training catalog purchases (one-time per staff).
 * - Comped orgs (True North, or Hive Exec exempt) never pay seats or training.
 * - Paying orgs are charged catalog amounts: full $300, CPR $75, Mandt $200, DSPD $100.
 * - Training is not included in the per-staff subscription.
 */
export function trainingRequiresCharge(opts: {
  billingExempt: boolean;
  hasHiveTrainingAddon: boolean;
  catalogKind: string;
  priceCents: number;
}): boolean {
  if (opts.billingExempt) return false;
  if (opts.priceCents <= 0) return false;
  void opts.hasHiveTrainingAddon;
  void opts.catalogKind;
  return true;
}

export const UNPAID_LOCK_REASON = "Payment required to use Hive";
