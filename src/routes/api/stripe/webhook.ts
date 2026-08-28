/**
 * Stripe webhook — signature verified, then applied in stripe-webhook.ts.
 *
 * Dane: point the Stripe Dashboard (test mode) endpoint to
 *   https://agency-peace-of-mind.vercel.app/api/stripe/webhook
 */

import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhookRequest } from "@/lib/stripe-webhook-http";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleStripeWebhookRequest(request),
    },
  },
});
