/**
 * Legacy webhook path. Same handler as /api/stripe/webhook.
 * Prefer the shorter URL in the Stripe Dashboard.
 */

import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhookRequest } from "@/lib/stripe-webhook-http";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => handleStripeWebhookRequest(request),
    },
  },
});
