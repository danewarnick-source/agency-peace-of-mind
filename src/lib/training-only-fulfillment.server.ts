/**
 * Mark a public training-only order paid. No organization. No staff row.
 * Hive Executive Training lists the seats after this runs.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type FulfillTrainingOnlyInput = {
  orderId: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  amountCents?: number;
};

export async function fulfillTrainingOnlyOrder(
  input: FulfillTrainingOnlyInput,
): Promise<{ ok: true; alreadyPaid: boolean }> {
  const sb = supabaseAdmin as AnySupabase;
  const nowIso = new Date().toISOString();

  const { data: order, error } = await sb
    .from("training_only_orders")
    .select("id, payment_status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    if (/training_only_orders|schema cache|does not exist/i.test(error.message ?? "")) {
      throw new Error("Training-only tables are not applied yet. Core: run the SQL handoff.");
    }
    throw new Error(error.message);
  }
  if (!order) throw new Error("Training order not found.");

  if (order.payment_status === "paid") {
    return { ok: true, alreadyPaid: true };
  }

  const { error: updErr } = await sb
    .from("training_only_orders")
    .update({
      payment_status: "paid",
      paid_at: nowIso,
      updated_at: nowIso,
      stripe_checkout_session_id: input.stripeSessionId ?? null,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      amount_cents: typeof input.amountCents === "number" ? input.amountCents : undefined,
    })
    .eq("id", input.orderId)
    .eq("payment_status", "pending");
  if (updErr) throw new Error(updErr.message);

  return { ok: true, alreadyPaid: false };
}

export async function loadTrainingOnlyOrderBySession(
  sessionId: string,
): Promise<{ id: string; payment_status: string } | null> {
  const sb = supabaseAdmin as AnySupabase;
  const { data, error } = await sb
    .from("training_only_orders")
    .select("id, payment_status")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) {
    if (/training_only_orders|schema cache|does not exist/i.test(error.message ?? "")) return null;
    throw new Error(error.message);
  }
  return data as { id: string; payment_status: string } | null;
}
