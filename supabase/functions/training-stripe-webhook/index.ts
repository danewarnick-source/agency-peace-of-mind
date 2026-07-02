// HIVE Training — Stripe webhook. Verifies signature, marks order paid,
// creates seats (bulk_seats) or a paid assignment (individual). Idempotent by
// stripe event id. No PHI touched; strictly hive_training_* + payment_events.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_TRAINING");
  if (!stripeKey || !webhookSecret) {
    return new Response("payments_not_configured", { status: 501 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
  } catch (err) {
    return new Response(`invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Idempotency: skip if we've already logged this event.
  const { data: existing } = await admin
    .from("payment_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing) return new Response("duplicate", { status: 200 });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(admin, session);
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeRefunded(admin, charge);
    }

    await admin.from("payment_events").insert({
      event_type: event.type,
      stripe_event_id: event.id,
      amount_cents:
        (event.data.object as { amount_total?: number; amount?: number }).amount_total ??
        (event.data.object as { amount?: number }).amount ??
        null,
      metadata: event.data.object as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.error("training-stripe-webhook handler failed", err);
    return new Response(`handler_error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

async function handleCheckoutCompleted(
  admin: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  const orderId = session.metadata?.hive_order_id;
  if (!orderId) return;

  const modeContext = session.metadata?.mode_context as "bulk_seats" | "individual" | undefined;
  const catalogId = session.metadata?.catalog_id;
  const orgId = session.metadata?.organization_id || null;
  const assigneeUserId = session.metadata?.assignee_user_id || null;
  const quantity = Number(session.metadata?.quantity ?? "1") || 1;

  await admin
    .from("hive_training_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: (session.payment_intent as string) ?? null,
      stripe_customer_id: (session.customer as string) ?? null,
    })
    .eq("id", orderId);

  if (!catalogId) return;

  const { data: sku } = await admin
    .from("hive_training_catalog")
    .select("id, fulfills_course_ids")
    .eq("id", catalogId)
    .maybeSingle();
  const courseIds: string[] = (sku?.fulfills_course_ids as string[] | null) ?? [];

  if (modeContext === "bulk_seats") {
    if (!orgId) return;
    const rows = Array.from({ length: quantity }).map(() => ({
      organization_id: orgId,
      order_id: orderId,
      catalog_id: catalogId,
      status: "available",
    }));
    await admin.from("hive_training_seats").insert(rows);
  } else if (modeContext === "individual" && assigneeUserId) {
    const targetCourseIds = courseIds.length ? courseIds : [];
    if (targetCourseIds.length === 0) return;
    const assignmentRows = targetCourseIds.map((courseId) => ({
      organization_id: orgId,
      user_id: assigneeUserId,
      course_id: courseId,
      payment_model: "individual",
      order_id: orderId,
      status: "not_started",
    }));
    await admin.from("hive_training_assignments").insert(assignmentRows);
  }
}

async function handleChargeRefunded(
  admin: ReturnType<typeof createClient>,
  charge: Stripe.Charge,
) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!paymentIntentId) return;

  const { data: order } = await admin
    .from("hive_training_orders")
    .select("id, model")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!order) return;

  await admin
    .from("hive_training_orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", order.id);

  // Revoke seats that were never consumed.
  await admin
    .from("hive_training_seats")
    .update({ status: "revoked" })
    .eq("order_id", order.id)
    .eq("status", "available");
}
