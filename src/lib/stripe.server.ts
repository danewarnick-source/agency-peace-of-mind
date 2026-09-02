/**
 * Server-only Stripe client. Do not import from browser code.
 */

import Stripe from "stripe";
import { readStripeEnv, stripeClientConfigured, isStripeLiveSecretKey } from "@/lib/stripe-config";
import { CANONICAL_SITE_ORIGIN, isSafeAuthOrigin } from "@/lib/auth-redirect";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const env = readStripeEnv();
  const cfg = stripeClientConfigured(env);
  if (!cfg.ok || !env.secretKey) {
    throw new Error(cfg.message ?? "Payments are not set up yet.");
  }
  if (isStripeLiveSecretKey(env.secretKey)) {
    throw new Error(
      "TEST MODE only. Live Stripe keys are blocked. This host cannot charge a real card. Use sk_test_ / pk_test_ keys.",
    );
  }
  if (!cached) {
    cached = new Stripe(env.secretKey);
  }
  return cached;
}

export function appOriginFromRequest(request: Request | null | undefined): string {
  const explicit = (process.env.APP_ORIGIN ?? process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (explicit && isSafeAuthOrigin(explicit)) return explicit;
  const origin = request?.headers.get("origin");
  if (origin && isSafeAuthOrigin(origin)) return origin.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) {
    const vercelOrigin = `https://${vercel.replace(/^https?:\/\//, "")}`;
    if (isSafeAuthOrigin(vercelOrigin)) return vercelOrigin;
  }
  return CANONICAL_SITE_ORIGIN;
}
