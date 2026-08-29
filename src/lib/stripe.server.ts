/**
 * Server-only Stripe client. Do not import from browser code.
 */

import Stripe from "stripe";
import { readStripeEnv, stripeClientConfigured, isStripeLiveSecretKey } from "@/lib/stripe-config";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const env = readStripeEnv();
  const cfg = stripeClientConfigured(env);
  if (!cfg.ok || !env.secretKey) {
    throw new Error(cfg.message ?? "Payments are not set up yet.");
  }
  if (isStripeLiveSecretKey(env.secretKey)) {
    throw new Error("Live Stripe keys are blocked. Use test-mode keys only.");
  }
  if (!cached) {
    cached = new Stripe(env.secretKey);
  }
  return cached;
}

export function appOriginFromRequest(request: Request | null | undefined): string {
  const explicit = (process.env.APP_ORIGIN ?? process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (explicit) return explicit;
  const origin = request?.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "https://agency-peace-of-mind.vercel.app";
}
