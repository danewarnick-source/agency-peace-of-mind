/**
 * Public training-only Stripe Checkout. No auth. No subscription. No org.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PAYMENTS_NOT_CONFIGURED,
  isStripeLiveSecretKey,
  readStripeEnv,
  stripePaymentsConfigured,
} from "@/lib/stripe-config";
import { appOriginFromRequest, getStripe } from "@/lib/stripe.server";
import { quoteSignupTrainingAddon } from "@/lib/pi-signup-pricing";
import {
  cleanTrainingOnlyPeople,
  isTrainingOnlySku,
  isValidBuyerEmail,
  normalizeBuyerEmail,
  quoteTrainingOnlyPeople,
  trainingOnlyLineItems,
  validateTrainingOnlyBuyer,
  validateTrainingOnlyPeople,
  type TrainingOnlyPersonRow,
  type TrainingOnlySku,
} from "@/lib/training-only";
import {
  fulfillTrainingOnlyOrder,
  loadTrainingOnlyOrderBySession,
} from "@/lib/training-only-fulfillment.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const UUID_RE = /^[0-9a-f-]{36}$/i;

function parsePeople(raw: unknown): TrainingOnlyPersonRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const sku = String(o.sku ?? "");
    return {
      name: String(o.name ?? ""),
      sku: isTrainingOnlySku(sku) ? sku : "cpr_first_aid",
    };
  });
}

export const getTrainingOnlyPaymentsStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const env = readStripeEnv();
  const cfg = stripePaymentsConfigured(env);
  return {
    paymentsConfigured: cfg.ok,
    testMode: cfg.testMode,
    liveBlocked: isStripeLiveSecretKey(env.secretKey),
    message: cfg.message,
  };
});

type CreateInput = {
  buyerEmail: string;
  buyerAgencyName?: string | null;
  termsAccepted: boolean;
  people: TrainingOnlyPersonRow[];
};

export const createTrainingOnlyCheckoutFn = createServerFn({ method: "POST" })
  .inputValidator((input: CreateInput) => {
    const buyerEmail = normalizeBuyerEmail(String(input?.buyerEmail ?? ""));
    const buyerAgencyName = String(input?.buyerAgencyName ?? "").trim() || null;
    const termsAccepted = input?.termsAccepted === true;
    const people = cleanTrainingOnlyPeople(parsePeople(input?.people));
    const buyerError = validateTrainingOnlyBuyer({
      email: buyerEmail,
      agencyName: buyerAgencyName,
      termsAccepted,
    });
    if (buyerError) throw new Error(buyerError);
    const rosterError = validateTrainingOnlyPeople(people);
    if (rosterError) throw new Error(rosterError);
    return { buyerEmail, buyerAgencyName, termsAccepted, people };
  })
  .handler(async ({ data }) => {
    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) {
      return { url: null as string | null, orderId: null as string | null, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };
    }
    if (isStripeLiveSecretKey(readStripeEnv().secretKey)) {
      return {
        url: null,
        orderId: null,
        error:
          "TEST MODE only. Live Stripe keys are blocked. This host cannot charge a real card. Use a preview URL with sk_test_ / pk_test_ keys.",
      };
    }

    const quote = quoteTrainingOnlyPeople(data.people);
    const admin = supabaseAdmin as AnySupabase;
    const { data: order, error: orderErr } = await admin
      .from("training_only_orders")
      .insert({
        buyer_email: data.buyerEmail,
        buyer_agency_name: data.buyerAgencyName,
        terms_accepted_at: new Date().toISOString(),
        payment_status: "pending",
        amount_cents: quote.totalCents,
        currency: "usd",
      })
      .select("id")
      .single();
    if (orderErr || !order) {
      return {
        url: null,
        orderId: null,
        error:
          /training_only_orders|schema cache|does not exist/i.test(orderErr?.message ?? "")
            ? "Training-only checkout is not live yet. Core: run the SQL handoff."
            : (orderErr?.message ?? "Could not start the order."),
      };
    }

    const seatRows = data.people.map((person) => ({
      order_id: order.id,
      person_name: person.name,
      person_email: data.buyerEmail,
      sku: person.sku,
      unit_price_cents: quoteSignupTrainingAddon(person.sku).priceCents,
      fulfillment_status: "awaiting_setup",
    }));
    const { error: seatErr } = await admin.from("training_only_seats").insert(seatRows);
    if (seatErr) {
      return { url: null, orderId: order.id, error: seatErr.message };
    }

    const stripe = getStripe();
    const origin = appOriginFromRequest(getRequest());
    const env = readStripeEnv();
    const lineItems = trainingOnlyLineItems(data.people, env);
    if (lineItems.length === 0) {
      return { url: null, orderId: order.id, error: "Add at least one person." };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: data.buyerEmail,
      line_items: lineItems,
      client_reference_id: order.id,
      success_url: `${origin}/training/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/training?checkout=cancelled`,
      metadata: {
        hive_kind: "training_only",
        training_only_order_id: order.id,
        buyer_email: data.buyerEmail,
        people: String(data.people.length),
      },
    });

    await admin
      .from("training_only_orders")
      .update({
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return { url: session.url, orderId: order.id as string, error: null as string | null };
  });

export type TrainingOnlyConfirmSeat = {
  id: string;
  personName: string;
  sku: TrainingOnlySku;
  skuLabel: string;
  unitCents: number;
  includesThirtyDay: boolean;
  includesClassSeat: boolean;
};

export type TrainingOnlyConfirmOrder = {
  id: string;
  buyerEmail: string;
  buyerAgencyName: string | null;
  paymentStatus: "pending" | "paid" | "cancelled";
  amountCents: number;
  paidAt: string | null;
  seats: TrainingOnlyConfirmSeat[];
};

export const confirmTrainingOnlyCheckoutFn = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionId: string }) => {
    const sessionId = String(input?.sessionId ?? "").trim();
    if (!sessionId.startsWith("cs_")) throw new Error("Invalid checkout session.");
    return { sessionId };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; order: TrainingOnlyConfirmOrder | null; error: string | null }> => {
    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) return { ok: false, order: null, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    const hiveKind = session.metadata?.hive_kind;
    if (hiveKind && hiveKind !== "training_only") {
      return { ok: false, order: null, error: "That checkout is not a training-only order." };
    }

    let orderId = session.metadata?.training_only_order_id ?? session.client_reference_id ?? "";
    if (!UUID_RE.test(orderId)) {
      const bySession = await loadTrainingOnlyOrderBySession(session.id);
      orderId = bySession?.id ?? "";
    }
    if (!UUID_RE.test(orderId)) {
      return { ok: false, order: null, error: "Could not find that training order." };
    }

    const paid = session.payment_status === "paid" || session.status === "complete";
    if (paid) {
      await fulfillTrainingOnlyOrder({
        orderId,
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        amountCents: session.amount_total ?? 0,
      });
    }

    const order = await loadConfirmOrder(orderId);
    if (!order) return { ok: false, order: null, error: "Training order not found." };
    return { ok: order.paymentStatus === "paid", order, error: order.paymentStatus === "paid" ? null : "Payment is not complete yet." };
  });

async function loadConfirmOrder(orderId: string): Promise<TrainingOnlyConfirmOrder | null> {
  const admin = supabaseAdmin as AnySupabase;
  const { data: order, error } = await admin
    .from("training_only_orders")
    .select("id, buyer_email, buyer_agency_name, payment_status, amount_cents, paid_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return null;

  const { data: seats, error: seatErr } = await admin
    .from("training_only_seats")
    .select("id, person_name, sku, unit_price_cents")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (seatErr) return null;

  return {
    id: String(order.id),
    buyerEmail: String(order.buyer_email),
    buyerAgencyName: (order.buyer_agency_name as string | null) ?? null,
    paymentStatus: order.payment_status as TrainingOnlyConfirmOrder["paymentStatus"],
    amountCents: Number(order.amount_cents ?? 0),
    paidAt: (order.paid_at as string | null) ?? null,
    seats: ((seats ?? []) as Array<{
      id: string;
      person_name: string;
      sku: string;
      unit_price_cents: number;
    }>).flatMap((row) => {
      if (!isTrainingOnlySku(row.sku)) return [];
      const quoted = quoteSignupTrainingAddon(row.sku);
      return [
        {
          id: row.id,
          personName: row.person_name,
          sku: row.sku,
          skuLabel: quoted.name,
          unitCents: Number(row.unit_price_cents ?? quoted.priceCents),
          includesThirtyDay: row.sku === "thirty_day" || row.sku === "pack",
          includesClassSeat: row.sku === "cpr_first_aid" || row.sku === "mandt" || row.sku === "pack",
        },
      ];
    }),
  };
}
