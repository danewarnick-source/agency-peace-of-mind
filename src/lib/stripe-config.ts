/**
 * Stripe env + price mapping. Test mode only for this release.
 *
 * Never log secret values. Missing keys fail closed on Checkout, not on login.
 */

import { getTier, type TierId } from "./hive-tiers.ts";

export type StripePriceEnv = {
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
  pricePro: string | null;
  priceEnterprise: string | null;
  priceTrainingFull: string | null;
};

export function readStripeEnv(env: NodeJS.Dict<string> = process.env): StripePriceEnv {
  return {
    secretKey: emptyToNull(env.STRIPE_SECRET_KEY),
    publishableKey: emptyToNull(env.STRIPE_PUBLISHABLE_KEY),
    webhookSecret: emptyToNull(env.STRIPE_WEBHOOK_SECRET),
    pricePro: emptyToNull(env.STRIPE_PRICE_PRO),
    priceEnterprise: emptyToNull(env.STRIPE_PRICE_ENTERPRISE),
    priceTrainingFull: emptyToNull(env.STRIPE_PRICE_TRAINING_FULL),
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

export function stripePaymentsConfigured(env: StripePriceEnv = readStripeEnv()): {
  ok: boolean;
  message: string | null;
  testMode: boolean;
} {
  const client = stripeClientConfigured(env);
  if (!client.ok) return client;
  if (!env.pricePro || !env.priceEnterprise) {
    return {
      ok: false,
      message:
        "Stripe is missing price IDs. Add STRIPE_PRICE_PRO and STRIPE_PRICE_ENTERPRISE from the Stripe Dashboard (test mode).",
      testMode: client.testMode,
    };
  }
  return {
    ok: true,
    message: null,
    testMode: client.testMode,
  };
}

export function stripePriceIdForPlan(plan: TierId, env: StripePriceEnv = readStripeEnv()): string | null {
  if (plan === "pro") return env.pricePro;
  if (plan === "enterprise") return env.priceEnterprise;
  return null;
}

export function mrrCentsForPlan(plan: string): number {
  return getTier(plan).monthlyPriceCents ?? 0;
}

export const PAYMENTS_NOT_CONFIGURED = "payments_not_configured";
