/**
 * Fulfill a HIVE Training catalog purchase (seats / assignments).
 * Used by the Stripe webhook and by the "included in plan / comped" skip-charge path.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TrainingFulfillInput = {
  orderId: string;
  catalogId: string;
  organizationId: string;
  modeContext: "bulk_seats" | "individual";
  quantity: number;
  assigneeUserId?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  amountCents?: number;
};

export async function fulfillTrainingOrder(input: TrainingFulfillInput): Promise<{ ok: true }> {
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;

  const { data: existingSeats } = await admin
    .from("hive_training_seats")
    .select("id")
    .eq("order_id", input.orderId)
    .limit(1);
  const { data: existingAsg } = await admin
    .from("hive_training_assignments")
    .select("id")
    .eq("order_id", input.orderId)
    .limit(1);
  if ((existingSeats && existingSeats.length > 0) || (existingAsg && existingAsg.length > 0)) {
    await admin
      .from("hive_training_orders")
      .update({
        status: "paid",
        paid_at: nowIso,
        stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
        stripe_customer_id: input.stripeCustomerId ?? null,
      })
      .eq("id", input.orderId);
    return { ok: true };
  }

  await admin
    .from("hive_training_orders")
    .update({
      status: "paid",
      paid_at: nowIso,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      stripe_customer_id: input.stripeCustomerId ?? null,
    })
    .eq("id", input.orderId);

  const { data: sku } = await admin
    .from("hive_training_catalog")
    .select("id, fulfills_course_ids")
    .eq("id", input.catalogId)
    .maybeSingle();
  const courseIds: string[] = (sku?.fulfills_course_ids as string[] | null) ?? [];

  if (input.modeContext === "bulk_seats") {
    let intentList: Array<{ id: string; user_id: string; course_id: string }> = [];
    if (input.stripeSessionId) {
      const { data: intents } = await admin
        .from("hive_training_renewal_intents")
        .select("id, user_id, course_id")
        .eq("stripe_session_id", input.stripeSessionId)
        .is("consumed_at", null);
      intentList = (intents ?? []) as Array<{ id: string; user_id: string; course_id: string }>;
    }

    const seatRows = Array.from({ length: Math.max(1, input.quantity) }).map(() => ({
      organization_id: input.organizationId,
      order_id: input.orderId,
      catalog_id: input.catalogId,
      status: intentList.length > 0 ? "consumed" : "available",
      consumed_at: intentList.length > 0 ? nowIso : null,
    }));
    const { data: insertedSeats } = await admin.from("hive_training_seats").insert(seatRows).select("id");

    if (intentList.length > 0 && insertedSeats && insertedSeats.length > 0) {
      const pairs = intentList.slice(0, insertedSeats.length).map((intent, idx) => ({
        seatId: insertedSeats[idx].id as string,
        intent,
      }));
      for (const p of pairs) {
        await admin
          .from("hive_training_seats")
          .update({ assigned_to_user_id: p.intent.user_id })
          .eq("id", p.seatId);
      }
      await admin.from("hive_training_assignments").insert(
        pairs.map((p) => ({
          organization_id: input.organizationId,
          user_id: p.intent.user_id,
          course_id: p.intent.course_id,
          payment_model: "bulk_seats",
          order_id: input.orderId,
          seat_id: p.seatId,
          status: "not_started",
        })),
      );
      await admin
        .from("hive_training_renewal_intents")
        .update({ consumed_at: nowIso })
        .in(
          "id",
          pairs.map((p) => p.intent.id),
        );
    }
  } else if (input.modeContext === "individual" && input.assigneeUserId) {
    const targetCourseIds = courseIds.length ? courseIds : [];
    if (targetCourseIds.length > 0) {
      await admin.from("hive_training_assignments").insert(
        targetCourseIds.map((courseId) => ({
          organization_id: input.organizationId,
          user_id: input.assigneeUserId,
          course_id: courseId,
          payment_model: "individual",
          order_id: input.orderId,
          status: "not_started",
        })),
      );
    }
  }

  return { ok: true };
}
