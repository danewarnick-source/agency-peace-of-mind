/**
 * Stripe env + price mapping. Test / sandbox only for this release.
 *
 * Account: Hive sandbox / Hive (acct_1Ti6CMIQWmyptLnb)
 * Dashboard: https://dashboard.stripe.com/acct_1Ti6CMIQWmyptLnb/test/dashboard
 *
 * Price IDs stay as env placeholders until Dane pastes the price_ values.
 * Checkout can still run with price_data when IDs are missing.
 * Never log secret values. Missing keys fail closed on Checkout, not on login.
 * Live sk_live_ keys are rejected.
 */

import {
  LIST_PER_STAFF_CENTS_1_19,
  LIST_PER_STAFF_CENTS_20_49,
  LIST_PER_STAFF_CENTS_50_PLUS,
  type HiveQuote,
  trainingPriceCentsForSku,
} from "./hive-pricing.ts";

/** Hive sandbox (test mode). Not a secret. */
export const STRIPE_TEST_ACCOUNT_ID = "acct_1Ti6CMIQWmyptLnb";

export type StripePriceEnv = {
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
  priceStaffListMonthly: string | null;
  priceStaffListAnnual: string | null;
  priceStaffList20Monthly: string | null;
  priceStaffList50Monthly: string | null;
  priceStaffFoundingMonthly: string | null;
  priceStaffFoundingAnnual: string | null;
  couponFounding: string | null;
  couponAnnual: string | null;
  priceTrainingFull: string | null;
  priceTrainingCpr: string | null;
  priceTrainingMandt: string | null;
  priceTrainingDspd: string | null;
};

export function readStripeEnv(env: NodeJS.Dict<string> = process.env): StripePriceEnv {
  return {
    secretKey: emptyToNull(env.STRIPE_SECRET_KEY),
    publishableKey: emptyToNull(env.STRIPE_PUBLISHABLE_KEY),
    webhookSecret: emptyToNull(env.STRIPE_WEBHOOK_SECRET),
    priceStaffListMonthly: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_MONTHLY),
    priceStaffListAnnual: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_ANNUAL),
    priceStaffList20Monthly: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_20_MONTHLY),
    priceStaffList50Monthly: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_50_MONTHLY),
    priceStaffFoundingMonthly: emptyToNull(env.STRIPE_PRICE_STAFF_FOUNDING_MONTHLY),
    priceStaffFoundingAnnual: emptyToNull(env.STRIPE_PRICE_STAFF_FOUNDING_ANNUAL),
    couponFounding: emptyToNull(env.STRIPE_COUPON_FOUNDING),
    couponAnnual: emptyToNull(env.STRIPE_COUPON_ANNUAL),
    priceTrainingFull:
      emptyToNull(env.STRIPE_PRICE_TRAINING_FULL) ?? emptyToNull(env.STRIPE_PRICE_TRAINING),
    priceTrainingCpr: emptyToNull(env.STRIPE_PRICE_TRAINING_CPR),
    priceTrainingMandt: emptyToNull(env.STRIPE_PRICE_TRAINING_MANDT),
    priceTrainingDspd: emptyToNull(env.STRIPE_PRICE_TRAINING_DSPD),
  };
}

function emptyToNull(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

export function isStripeTestPublishableKey(key: string | null | undefined): boolean {
  return (key ?? "").startsWith("pk_test_");
}

export function isStripeLiveSecretKey(key: string | null | undefined): boolean {
  return (key ?? "").startsWith("sk_live_");
}

/** Secret key present and not live. Used by the webhook and Stripe client. Price IDs not required. */
export function stripeClientConfigured(env: StripePriceEnv = readStripeEnv()): {
  ok: boolean;
  message: string | null;
  testMode: boolean;
} {
  if (!env.secretKey) {
    return {
      ok: false,
      message: "Payments are not set up yet. Add STRIPE_SECRET_KEY (test mode) in the host environment.",
      testMode: false,
    };
  }
  if (isStripeLiveSecretKey(env.secretKey)) {
    return {
      ok: false,
      message: "Live Stripe keys are blocked. Use test-mode keys (sk_test_ / pk_test_) only.",
      testMode: false,
    };
  }
  return {
    ok: true,
    message: null,
    testMode: env.secretKey.startsWith("sk_test_") || isStripeTestPublishableKey(env.publishableKey),
  };
}

/**
 * Checkout is allowed with the secret key alone (price_data fallback).
 * Per-staff / training price_ IDs are optional until Dane pastes them.
 */
export function stripePaymentsConfigured(env: StripePriceEnv = readStripeEnv()): {
  ok: boolean;
  message: string | null;
  testMode: boolean;
} {
  return stripeClientConfigured(env);
}

export type StripeSeatPricePick = {
  priceId: string | null;
  couponId: string | null;
  usePriceData: boolean;
};

export function stripeSeatPriceForQuote(
  quote: Pick<HiveQuote, "schedule" | "interval" | "perStaffCents">,
  env: StripePriceEnv = readStripeEnv(),
): StripeSeatPricePick {
  const annual = quote.interval === "annual";
  if (quote.schedule === "founding") {
    const foundingId = annual ? env.priceStaffFoundingAnnual : env.priceStaffFoundingMonthly;
    if (foundingId) return { priceId: foundingId, couponId: null, usePriceData: false };
    const listId = annual ? env.priceStaffListAnnual : env.priceStaffListMonthly;
    if (listId && env.couponFounding) {
      return { priceId: listId, couponId: env.couponFounding, usePriceData: false };
    }
    return { priceId: null, couponId: null, usePriceData: true };
  }

  let priceId: string | null = null;
  if (quote.perStaffCents === LIST_PER_STAFF_CENTS_20_49) {
    priceId = annual ? null : env.priceStaffList20Monthly;
  } else if (quote.perStaffCents === LIST_PER_STAFF_CENTS_50_PLUS) {
    priceId = annual ? null : env.priceStaffList50Monthly;
  } else if (quote.perStaffCents === LIST_PER_STAFF_CENTS_1_19) {
    priceId = annual ? env.priceStaffListAnnual : env.priceStaffListMonthly;
  }
  if (priceId) return { priceId, couponId: null, usePriceData: false };
  return { priceId: null, couponId: annual ? env.couponAnnual : null, usePriceData: true };
}

export function stripePriceIdForTrainingSku(
  sku: string,
  catalogPriceId?: string | null,
  env: StripePriceEnv = readStripeEnv(),
): string | null {
  if (typeof catalogPriceId === "string" && catalogPriceId.startsWith("price_")) return catalogPriceId;
  const key = sku.trim().toLowerCase();
  if (key === "full_program" || key === "full") return env.priceTrainingFull;
  if (key === "cpr_first_aid" || key === "cpr") return env.priceTrainingCpr;
  if (key === "mandt") return env.priceTrainingMandt;
  if (key === "dspd_required" || key === "dspd") return env.priceTrainingDspd;
  return null;
}

/** @deprecated Training extras use per-SKU catalog amounts, not a $49 SKU. */
export function stripePriceIdForTrainingExtra(
  catalogKind: string,
  catalogPriceId?: string | null,
  env: StripePriceEnv = readStripeEnv(),
): string | null {
  if (typeof catalogPriceId === "string" && catalogPriceId.startsWith("price_")) return catalogPriceId;
  if (catalogKind === "full_program") return env.priceTrainingFull;
  return env.priceTrainingCpr ?? env.priceTrainingFull;
}

export function stripeUnitAmountForTrainingSku(sku: string, catalogPriceCents?: number | null): number {
  return trainingPriceCentsForSku(sku, catalogPriceCents);
}

/** Flat-plan helper kept for Enterprise/custom Hive Exec overrides only. Never a $499 default. */
export function mrrCentsForPlan(plan: string): number {
  const id = (plan ?? "").toLowerCase();
  if (id === "enterprise" || id === "custom") return 0;
  return 0;
}

export type StripeLineItem = {
  price?: string;
  quantity: number;
  price_data?: {
    currency: string;
    unit_amount: number;
    product_data: { name: string; metadata?: Record<string, string> };
    recurring?: { interval: "month" | "year" };
  };
};

export function subscriptionLineItemsForQuote(quote: HiveQuote): {
  lineItems: StripeLineItem[];
  discounts: Array<{ coupon: string }> | undefined;
  pick: StripeSeatPricePick;
} {
  const env = readStripeEnv();
  const pickResolved = stripeSeatPriceForQuote(quote, env);
  const recurringInterval: "month" | "year" = quote.interval === "annual" ? "year" : "month";
  const productName =
    quote.schedule === "founding"
      ? `Hive founding · ${quote.staffCount} staff`
      : `Hive · ${quote.staffCount} staff · ${quote.volumeLabel}`;

  if (pickResolved.priceId && !quote.minimumApplied) {
    const discounts = pickResolved.couponId ? [{ coupon: pickResolved.couponId }] : undefined;
    return {
      lineItems: [{ price: pickResolved.priceId, quantity: quote.staffCount }],
      discounts,
      pick: pickResolved,
    };
  }

  if (pickResolved.priceId && quote.minimumApplied && quote.interval === "monthly") {
    const topUp = quote.monthlyCents - quote.rawMonthlyCents;
    const discounts = pickResolved.couponId ? [{ coupon: pickResolved.couponId }] : undefined;
    const items: StripeLineItem[] = [{ price: pickResolved.priceId, quantity: quote.staffCount }];
    if (topUp > 0) {
      items.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: topUp,
          recurring: { interval: "month" },
          product_data: { name: "Hive monthly minimum top-up" },
        },
      });
    }
    return { lineItems: items, discounts, pick: pickResolved };
  }

  return {
    lineItems: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.billedCents,
          recurring: { interval: recurringInterval },
          product_data: {
            name: productName,
            metadata: {
              pricing_schedule: quote.schedule,
              staff_count: String(quote.staffCount),
            },
          },
        },
      },
    ],
    discounts: undefined,
    pick: pickResolved,
  };
}

export const PAYMENTS_NOT_CONFIGURED = "payments_not_configured";
