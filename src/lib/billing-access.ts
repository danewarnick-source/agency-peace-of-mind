/**
 * Pure billing-access rules. No I/O — unit-tested.
 *
 * Source of truth for "does this company have to pay?" and "is the dashboard locked?"
 * True North Supports is never charged: billing_exempt on the org, with a name
 * fallback so TNS still works if the SQL handoff has not been run yet.
 */

import { TNS_ORGANIZATION_ID } from "./current-org.ts";
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
  organizationId?: string | null;
  displayAcronym?: string | null;
  subscription: SubscriptionGate | null;
};

export function orgLooksLikeTrueNorth(names: Array<string | null | undefined>): boolean {
  return names.some((n) => (n ?? "").toLowerCase().includes("true north supports"));
}

export function isBillingExempt(
  input: Pick<
    BillingGateInput,
    "billingExempt" | "orgName" | "legalName" | "dbaName" | "organizationId" | "displayAcronym"
  >,
): boolean {
  if (input.billingExempt === true) return true;
  if (input.organizationId === TNS_ORGANIZATION_ID) return true;
  if ((input.displayAcronym ?? "").trim().toUpperCase() === "TNS") return true;
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

/**
 * After Checkout return: leave /billing-locked when the live row is paid.
 * status=active with no lock wins. Missing row stays locked.
 */
export function shouldLeaveBillingLockScreen(input: BillingGateInput): boolean {
  return !orgAccessIsLocked(input);
}

export type CheckoutReturnSearch = {
  checkout?: string;
  session_id?: string;
};

/** Keep Stripe return params. Router validateSearch must not drop session_id. */
export function parseCheckoutReturnSearch(
  s: Record<string, unknown> | string | null | undefined,
): CheckoutReturnSearch {
  const src: Record<string, unknown> =
    typeof s === "string"
      ? Object.fromEntries(new URLSearchParams(s.startsWith("?") ? s.slice(1) : s))
      : s && typeof s === "object"
        ? s
        : {};
  const checkout = typeof src.checkout === "string" && src.checkout.trim() ? src.checkout.trim() : undefined;
  const rawId = typeof src.session_id === "string" ? src.session_id.trim() : "";
  return {
    ...(checkout ? { checkout } : {}),
    ...(rawId.startsWith("cs_") ? { session_id: rawId } : {}),
  };
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
 * - Paying orgs are charged locked amounts: package $300, CPR $100, Mandt $200, 30-day $75.
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

export const UNPAID_LOCK_REASON = "Payment required to use Provider Interface";

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
