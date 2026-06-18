// Stripe webhook receiver — TEST-MODE STUB.
//
// This endpoint is public (under /api/public/*). In production you MUST:
//   1. Verify the Stripe-Signature header using STRIPE_WEBHOOK_SECRET
//      (constructEvent / HMAC-SHA256 over the raw body, timing-safe compare).
//   2. Resolve event.data.object.customer -> our organization_id (lookup in
//      org_subscriptions.stripe_customer_id).
//   3. Only then call into billing-lockout.server helpers.
//
// For now we log the payload, dispatch to the correct stub by event.type,
// and pass through event.id for idempotency (recordPayment* and friends
// check stripe_event_id before writing).

import { createFileRoute } from "@tanstack/react-router";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

async function resolveOrgIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("org_subscriptions")
    .select("organization_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.organization_id as string | undefined) ?? null;
}

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();

        // SECURITY: Until Stripe signature verification is wired with the live
        // STRIPE_WEBHOOK_SECRET, this endpoint must NOT mutate billing state from
        // unverified payloads. A forged event could lock out a real org or fake a
        // payment. Reject everything unless the secret is configured AND the
        // signature verifies.
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const sig = request.headers.get("stripe-signature");

        if (!webhookSecret) {
          console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting unverified event");
          return new Response("Webhook not configured", { status: 503 });
        }

        if (!sig) {
          return new Response("Missing signature", { status: 400 });
        }

        // TODO(prod): when the stripe SDK is added, replace the line below with:
        //   let event: StripeEvent;
        //   try {
        //     event = Stripe.webhooks.constructEvent(raw, sig, webhookSecret) as StripeEvent;
        //   } catch { return new Response("Invalid signature", { status: 400 }); }
        // For now, because we cannot verify without the SDK + secret, reject.
        console.warn("[stripe-webhook] signature verification not implemented — rejecting");
        return new Response("Signature verification not implemented", { status: 501 });

        let event: StripeEvent;
        try {
          event = JSON.parse(raw) as StripeEvent;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        console.log("[stripe-webhook] received", { id: event.id, type: event.type });

        const obj = (event.data?.object ?? {}) as Record<string, unknown>;
        const customerId =
          typeof obj.customer === "string" ? (obj.customer as string) : null;
        const eventId = event.id ?? null;

        try {
          switch (event.type) {
            // -----------------------------------------------------------------
            // invoice.payment_succeeded -> recordPaymentSuccess
            // -----------------------------------------------------------------
            case "invoice.payment_succeeded": {
              const orgId = await resolveOrgIdFromCustomer(customerId);
              if (orgId === null) break;
              const amount = Number(obj.amount_paid ?? obj.amount_due ?? 0);
              const { recordPaymentSuccess } = await import(
                "@/lib/billing-lockout.server"
              );
              await recordPaymentSuccess(orgId as string, amount, eventId);
              break;
            }

            // -----------------------------------------------------------------
            // invoice.payment_failed -> recordPaymentFailure
            // -----------------------------------------------------------------
            case "invoice.payment_failed": {
              const orgId = await resolveOrgIdFromCustomer(customerId);
              if (orgId === null) break;
              const reason =
                (obj.last_finalization_error as { message?: string } | undefined)?.message ??
                "invoice.payment_failed";
              const { recordPaymentFailure } = await import(
                "@/lib/billing-lockout.server"
              );
              await recordPaymentFailure(orgId as string, reason, eventId);
              break;
            }

            // -----------------------------------------------------------------
            // payment_intent.payment_failed -> recordPaymentFailure
            // -----------------------------------------------------------------
            case "payment_intent.payment_failed": {
              const orgId = await resolveOrgIdFromCustomer(customerId);
              if (orgId === null) break;
              const reason =
                (obj.last_payment_error as { message?: string } | undefined)?.message ??
                "payment_intent.payment_failed";
              const { recordPaymentFailure } = await import(
                "@/lib/billing-lockout.server"
              );
              await recordPaymentFailure(orgId as string, reason, eventId);
              break;
            }

            // -----------------------------------------------------------------
            // customer.subscription.deleted -> lockAccount
            // -----------------------------------------------------------------
            case "customer.subscription.deleted": {
              const orgId = await resolveOrgIdFromCustomer(customerId);
              if (orgId === null) break;
              const { lockAccount } = await import("@/lib/billing-lockout.server");
              await lockAccount(orgId as string, "Subscription cancelled in Stripe");
              break;
            }

            // -----------------------------------------------------------------
            // payment_method.expiring_soon (a.k.a. .card_automatically_updated
            // signals from Stripe Billing) -> updateCardExpiry
            // -----------------------------------------------------------------
            case "payment_method.expiring_soon": {
              const orgId = await resolveOrgIdFromCustomer(customerId);
              if (orgId === null) break;
              const card = (obj.card ?? {}) as { exp_month?: number; exp_year?: number };
              if (card.exp_month && card.exp_year) {
                const lastDay = new Date(Date.UTC(card.exp_year as number, card.exp_month as number, 0));
                const iso = lastDay.toISOString().slice(0, 10);
                const { updateCardExpiry } = await import(
                  "@/lib/billing-lockout.server"
                );
                await updateCardExpiry(orgId as string, iso);
              }
              break;
            }

            default:
              console.log("[stripe-webhook] unhandled event type", event.type);
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error", err);
          // Return 200 so Stripe does not retry on our internal failure in test
          // mode; switch to 500 once signature verification is wired.
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
