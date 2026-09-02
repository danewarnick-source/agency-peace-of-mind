/**
 * Stripe env + price mapping. Test / sandbox only for this release.
 *
 * Account: Hive sandbox / Hive (acct_1Ti6CMIQWmyptLnb)
 * Dashboard: https://dashboard.stripe.com/acct_1Ti6CMIQWmyptLnb/test/dashboard
 *
 * Seat and training Price IDs below are public test-mode identifiers (not secrets).
 * STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY / STRIPE_WEBHOOK_SECRET stay env-only.
 * Live sk_live_ keys are rejected. Missing secret keys fail closed on Checkout, not on login.
 */

import {
  LIST_MIN_SEATS,
  LIST_PER_STAFF_CENTS_1_19,
  LIST_PER_STAFF_CENTS_20_49,
  LIST_PER_STAFF_CENTS_50_PLUS,
  type HiveQuote,
  trainingPriceCentsForSku,
} from "./hive-pricing.ts";
import type { PiListQuote, SignupTrainingQuote } from "./pi-signup-pricing.ts";

/** Hive sandbox (test mode). Not a secret. */
export const STRIPE_TEST_ACCOUNT_ID = "acct_1Ti6CMIQWmyptLnb";

/**
 * Test-mode Price IDs on acct_1Ti6CMIQWmyptLnb. Used when the matching env var
 * is unset. Override in the host environment; never commit secret keys.
 */
export const STRIPE_SANDBOX_PRICE_IDS = {
  /** Hive seat list, $125/mo, prod_V9XjHA2R4jLnn3 — hive_staff only, never PI list signup */
  seatList: "price_1U9EeRIQWMytpLnbNurGi0Vq",
  /** Hive seat founding, $79/mo, prod_V9XmH5qQO0TjHi — hive_staff only, never PI list signup */
  seatFounding: "price_1U9EgWIQWMytpLnbyBvs2f4L",
  /** PI list $69/client/mo — agency Checkout (signup + in-app pay) */
  piListPerClient: "price_1UBNUYIQWMytpLnbpygoWdLw",
  /** PI list $350/mo minimum — agency Checkout when clients × $69 < $350 */
  piListMinimum: "price_1UBNUYIQWMytpLnbpDKqVRhB",
  /** Full program / package $300 one-time (older hive catalog) */
  trainingFull: "price_1U9EhyIQWMytpLnbg2nkCFd8",
  /** PI list Pack $300 one-time */
  trainingPack: "price_1UBNeDIQWMytpLnbUy61NTkr",
  /** PI list CPR / First Aid $100 one-time */
  trainingCpr: "price_1UBNX2IQWMytpLnb5aoUlkAt",
  /**
   * Stale sandbox CPR Price ID ($75). Do not use as a default.
   */
  trainingCprStale75: "price_1U9EjNIQWMytpLnbPnfRb6Yz",
  /** PI list Mandt $200 one-time */
  trainingMandt: "price_1UBNbjIQWMytpLnbRJlOEOpM",
  /** Older hive Mandt catalog ($200). Env can still point here. */
  trainingMandtLegacy: "price_1U9EkmIQWMytpLnb2coYT0rn",
  /** PI list 30-day $75 one-time */
  trainingThirtyDay: "price_1UBNZHIQWMytpLnbRsc9uWlG",
  /**
   * Stale sandbox DSPD Price ID ($100). Locked 30-day is $75.
   */
  trainingDspdStale100: "price_1U9Em5IQWMytpLnb2of9BFOj",
} as const;

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
  pricePiListPerClient: string | null;
  pricePiListMinimum: string | null;
  priceTrainingFull: string | null;
  priceTrainingPack: string | null;
  priceTrainingCpr: string | null;
  priceTrainingMandt: string | null;
  priceTrainingThirtyDay: string | null;
  priceTrainingDspd: string | null;
};

export function readStripeEnv(env: NodeJS.Dict<string> = process.env): StripePriceEnv {
  return {
    secretKey: emptyToNull(env.STRIPE_SECRET_KEY),
    publishableKey: emptyToNull(env.STRIPE_PUBLISHABLE_KEY),
    webhookSecret: emptyToNull(env.STRIPE_WEBHOOK_SECRET),
    priceStaffListMonthly:
      emptyToNull(env.STRIPE_PRICE_SEAT_LIST) ??
      emptyToNull(env.STRIPE_PRICE_STAFF_LIST_MONTHLY) ??
      STRIPE_SANDBOX_PRICE_IDS.seatList,
    priceStaffListAnnual: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_ANNUAL),
    priceStaffList20Monthly: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_20_MONTHLY),
    priceStaffList50Monthly: emptyToNull(env.STRIPE_PRICE_STAFF_LIST_50_MONTHLY),
    priceStaffFoundingMonthly:
      emptyToNull(env.STRIPE_PRICE_SEAT_FOUNDING) ??
      emptyToNull(env.STRIPE_PRICE_STAFF_FOUNDING_MONTHLY) ??
      STRIPE_SANDBOX_PRICE_IDS.seatFounding,
    priceStaffFoundingAnnual: emptyToNull(env.STRIPE_PRICE_STAFF_FOUNDING_ANNUAL),
    couponFounding: emptyToNull(env.STRIPE_COUPON_FOUNDING),
    couponAnnual: emptyToNull(env.STRIPE_COUPON_ANNUAL),
    pricePiListPerClient:
      emptyToNull(env.STRIPE_PRICE_PI_LIST_PER_CLIENT) ?? STRIPE_SANDBOX_PRICE_IDS.piListPerClient,
    pricePiListMinimum:
      emptyToNull(env.STRIPE_PRICE_PI_LIST_MINIMUM) ?? STRIPE_SANDBOX_PRICE_IDS.piListMinimum,
    priceTrainingFull:
      emptyToNull(env.STRIPE_PRICE_TRAINING_FULL) ??
      emptyToNull(env.STRIPE_PRICE_TRAINING) ??
      STRIPE_SANDBOX_PRICE_IDS.trainingFull,
    priceTrainingPack:
      emptyToNull(env.STRIPE_PRICE_TRAINING_PACK) ?? STRIPE_SANDBOX_PRICE_IDS.trainingPack,
    priceTrainingCpr:
      emptyToNull(env.STRIPE_PRICE_TRAINING_CPR) ?? STRIPE_SANDBOX_PRICE_IDS.trainingCpr,
    priceTrainingMandt:
      emptyToNull(env.STRIPE_PRICE_TRAINING_MANDT) ?? STRIPE_SANDBOX_PRICE_IDS.trainingMandt,
    priceTrainingThirtyDay:
      emptyToNull(env.STRIPE_PRICE_TRAINING_THIRTY_DAY) ??
      emptyToNull(env.STRIPE_PRICE_TRAINING_DSPD) ??
      STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay,
    priceTrainingDspd:
      emptyToNull(env.STRIPE_PRICE_TRAINING_THIRTY_DAY) ??
      emptyToNull(env.STRIPE_PRICE_TRAINING_DSPD) ??
      STRIPE_SANDBOX_PRICE_IDS.trainingThirtyDay,
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
      message:
        "TEST MODE only. Live Stripe keys are blocked. This host cannot charge a real card. Use a preview URL with sk_test_ / pk_test_ keys.",
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
 * Checkout needs the secret key. Seat / training Price IDs default to the
 * Hive sandbox products; env vars override those defaults.
 */
export function stripePaymentsConfigured(env: StripePriceEnv = readStripeEnv()): {
  ok: boolean;
  message: string | null;
  testMode: boolean;
} {
  return stripeClientConfigured(env);
}

/** Agency Checkout is PI list unless a caller explicitly asks for leftover hive_staff math. */
export function resolveAgencyCheckoutPricingModel(
  value: "pi_list" | "hive_staff" | null | undefined,
): "pi_list" | "hive_staff" {
  return value === "hive_staff" ? "hive_staff" : "pi_list";
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
  const key = sku.trim().toLowerCase().replace(/-/g, "_");
  if (key === "pack") return env.priceTrainingPack ?? env.priceTrainingFull;
  if (key === "full_program" || key === "full" || key === "package") return env.priceTrainingFull;
  if (key === "cpr_first_aid" || key === "cpr") return env.priceTrainingCpr;
  if (key === "mandt") return env.priceTrainingMandt;
  if (key === "thirty_day" || key === "orientation_30" || key === "dspd_required" || key === "dspd") {
    return env.priceTrainingThirtyDay ?? env.priceTrainingDspd;
  }
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

export function subscriptionLineItemsForQuote(
  quote: HiveQuote,
  env: StripePriceEnv = readStripeEnv(),
): {
  lineItems: StripeLineItem[];
  discounts: Array<{ coupon: string }> | undefined;
  pick: StripeSeatPricePick;
} {
  const pickResolved = stripeSeatPriceForQuote(quote, env);
  const recurringInterval: "month" | "year" = quote.interval === "annual" ? "year" : "month";
  const productName =
    quote.schedule === "founding"
      ? `Provider Interface founding · ${quote.staffCount} staff`
      : `Provider Interface · ${quote.staffCount} staff · ${quote.volumeLabel}`;

  const listSeatMonthly =
    quote.schedule === "list" &&
    quote.interval === "monthly" &&
    quote.perStaffCents === LIST_PER_STAFF_CENTS_1_19 &&
    !!pickResolved.priceId;

  if (listSeatMonthly && pickResolved.priceId) {
    // $500 list minimum = 4 seats at the $125 list price.
    const quantity = Math.max(quote.staffCount, LIST_MIN_SEATS);
    return {
      lineItems: [{ price: pickResolved.priceId, quantity }],
      discounts: pickResolved.couponId ? [{ coupon: pickResolved.couponId }] : undefined,
      pick: pickResolved,
    };
  }

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
          product_data: { name: "Provider Interface monthly minimum top-up" },
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

/**
 * New-provider signup: $69/client catalog price × quantity, or the $350
 * minimum catalog price — never both (that would double-charge).
 * Never the sandbox $125 / $79 staff Price IDs. Optional one-time training
 * uses the matching TEST catalog Price IDs.
 */
export function subscriptionLineItemsForPiListQuote(
  quote: PiListQuote,
  training?: SignupTrainingQuote | null,
  env: StripePriceEnv = readStripeEnv(),
): { lineItems: StripeLineItem[] } {
  const items: StripeLineItem[] = [];
  if (quote.minimumApplied) {
    if (env.pricePiListMinimum) {
      items.push({ price: env.pricePiListMinimum, quantity: 1 });
    } else {
      items.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: quote.billedCents,
          recurring: { interval: "month" },
          product_data: {
            name: quote.productName,
            metadata: {
              pricing_model: "pi_list",
              client_count: String(quote.clientCount),
              minimum_applied: "true",
            },
          },
        },
      });
    }
  } else if (env.pricePiListPerClient) {
    items.push({ price: env.pricePiListPerClient, quantity: quote.clientCount });
  } else {
    items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: quote.billedCents,
        recurring: { interval: quote.interval === "annual" ? "year" : "month" },
        product_data: {
          name: quote.productName,
          metadata: {
            pricing_model: "pi_list",
            client_count: String(quote.clientCount),
            per_client_cents: String(quote.perClientCents),
            minimum_cents: String(quote.minimumCents),
          },
        },
      },
    });
  }
  if (training && training.id !== "none" && training.priceCents > 0) {
    const trainingPriceId = stripePriceIdForTrainingSku(training.id, null, env);
    if (trainingPriceId) {
      items.push({ price: trainingPriceId, quantity: 1 });
    } else {
      items.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: training.priceCents,
          product_data: {
            name: `Training · ${training.name}`,
            metadata: { hive_kind: "signup_training", training_addon: training.id },
          },
        },
      });
    }
  }
  return { lineItems: items };
}

/** Reconstruct monthly cents from PI list catalog lines (tests / sanity). Training omitted. */
export function monthlyCentsFromPiListLineItems(
  items: StripeLineItem[],
  env: StripePriceEnv = readStripeEnv(),
): number {
  let monthly = 0;
  for (const item of items) {
    if (item.price && env.pricePiListPerClient && item.price === env.pricePiListPerClient) {
      monthly += 6_900 * item.quantity;
    } else if (item.price && env.pricePiListMinimum && item.price === env.pricePiListMinimum) {
      monthly += 35_000 * item.quantity;
    } else if (item.price_data?.recurring && typeof item.price_data.unit_amount === "number") {
      monthly += item.price_data.unit_amount * item.quantity;
    }
  }
  return monthly;
}

export const PAYMENTS_NOT_CONFIGURED = "payments_not_configured";
