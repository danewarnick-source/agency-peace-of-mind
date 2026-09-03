/**
 * Training-only 30-day course access. No office membership required.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTrainingOnlySku, trainingOnlyIncludesThirtyDay, trainingOnlySkuLabel } from "@/lib/training-only";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const MISSING_TABLE = /training_only_|schema cache|does not exist/i;

export type TrainingOnlyLearnerSeat = {
  seatId: string;
  personName: string;
  skuLabel: string;
  classDate: string | null;
  classNotes: string | null;
};

export type TrainingOnlyLearnerHome = {
  hasThirtyDay: boolean;
  seats: TrainingOnlyLearnerSeat[];
};

export const trainingOnlyHomeForMeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingOnlyLearnerHome> => {
    const { userId } = context;
    if (!userId) return { hasThirtyDay: false, seats: [] };
    const admin = supabaseAdmin as AnySupabase;
    const { data, error } = await admin
      .from("training_only_seats")
      .select("id, person_name, sku, class_date, class_notes, access_user_id, order_id")
      .eq("access_user_id", userId);
    if (error) {
      if (MISSING_TABLE.test(error.message ?? "")) return { hasThirtyDay: false, seats: [] };
      throw new Error(error.message);
    }
    const rows = (data ?? []) as Array<{
      id: string;
      person_name: string;
      sku: string;
      class_date: string | null;
      class_notes: string | null;
      order_id: string;
    }>;
    const orderIds = [...new Set(rows.map((r) => r.order_id))];
    const paid = new Set<string>();
    if (orderIds.length) {
      const { data: orders, error: orderErr } = await admin
        .from("training_only_orders")
        .select("id, payment_status")
        .in("id", orderIds);
      if (orderErr && !MISSING_TABLE.test(orderErr.message ?? "")) throw new Error(orderErr.message);
      for (const o of (orders ?? []) as Array<{ id: string; payment_status: string }>) {
        if (o.payment_status === "paid") paid.add(o.id);
      }
    }
    const seats = rows.flatMap((row) => {
      if (!paid.has(row.order_id)) return [];
      if (!isTrainingOnlySku(row.sku) || !trainingOnlyIncludesThirtyDay(row.sku)) return [];
      return [
        {
          seatId: row.id,
          personName: row.person_name,
          skuLabel: trainingOnlySkuLabel(row.sku),
          classDate: row.class_date,
          classNotes: row.class_notes,
        },
      ];
    });
    return { hasThirtyDay: seats.length > 0, seats };
  });
