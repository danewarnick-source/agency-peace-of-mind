/**
 * HTTP entry for Stripe webhooks. Signature verified, then applied.
 * Shared by /api/stripe/webhook and the legacy /api/public/webhooks/stripe path.
 */

import { readStripeEnv, stripeClientConfigured } from "@/lib/stripe-config";
import { getStripe } from "@/lib/stripe.server";
import { handleVerifiedStripeEvent, type StripeLikeEvent } from "@/lib/stripe-webhook";

export async function handleStripeWebhookRequest(request: Request): Promise<Response> {
  const env = readStripeEnv();
  const cfg = stripeClientConfigured(env);
  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();

  if (!env.webhookSecret || !env.secretKey) {
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not set — rejecting");
    return new Response("Webhook not configured", { status: 503 });
  }
  if (!cfg.ok) {
    return new Response(cfg.message ?? "Payments not configured", { status: 503 });
  }
  if (!sig) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: StripeLikeEvent;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(raw, sig, env.webhookSecret) as unknown as StripeLikeEvent;
  } catch (err) {
    console.warn("[stripe-webhook] invalid signature", (err as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleVerifiedStripeEvent(event);
  } catch (err) {
    console.error("[stripe-webhook] handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
