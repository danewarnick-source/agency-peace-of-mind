/**
 * Hive Executive Training tab — public training-only orders.
 * Dane sets the class date and sends access. Not agency staff.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { HIVE_MANAGED_FROM_ADDRESS } from "@/lib/email.functions";
import { authRedirectUrl } from "@/lib/auth-redirect";
import { quoteSignupTrainingAddon } from "@/lib/pi-signup-pricing";
import {
  isTrainingOnlySku,
  isValidBuyerEmail,
  normalizeBuyerEmail,
  trainingOnlyIncludesClassSeat,
  trainingOnlyIncludesThirtyDay,
  trainingOnlySkuLabel,
  type TrainingOnlySku,
} from "@/lib/training-only";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MISSING_TABLE = /training_only_|schema cache|does not exist/i;

async function ensureHiveExecutive(sb: AnySupabase, userId: string): Promise<void> {
  const { data, error } = await sb
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied — Hive Executive permission required.");
}

export type TrainingOnlyExecSeat = {
  seatId: string;
  orderId: string;
  personName: string;
  sku: TrainingOnlySku;
  skuLabel: string;
  unitCents: number;
  buyerEmail: string;
  buyerAgencyName: string | null;
  paymentStatus: "pending" | "paid" | "cancelled";
  paidAt: string | null;
  orderedAt: string;
  fulfillmentStatus: "awaiting_setup" | "scheduled" | "sent" | "completed";
  classDate: string | null;
  classNotes: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  accessUserId: string | null;
  includesThirtyDay: boolean;
  includesClassSeat: boolean;
};

function mapSeat(
  order: {
    id: string;
    buyer_email: string;
    buyer_agency_name: string | null;
    payment_status: string;
    paid_at: string | null;
    created_at: string;
  },
  seat: {
    id: string;
    person_name: string;
    sku: string;
    unit_price_cents: number;
    fulfillment_status: string;
    class_date: string | null;
    class_notes: string | null;
    sent_at: string | null;
    sent_to_email: string | null;
    access_user_id: string | null;
  },
): TrainingOnlyExecSeat | null {
  if (!isTrainingOnlySku(seat.sku)) return null;
  return {
    seatId: seat.id,
    orderId: order.id,
    personName: seat.person_name,
    sku: seat.sku,
    skuLabel: trainingOnlySkuLabel(seat.sku),
    unitCents: Number(seat.unit_price_cents ?? quoteSignupTrainingAddon(seat.sku).priceCents),
    buyerEmail: order.buyer_email,
    buyerAgencyName: order.buyer_agency_name,
    paymentStatus: order.payment_status as TrainingOnlyExecSeat["paymentStatus"],
    paidAt: order.paid_at,
    orderedAt: order.created_at,
    fulfillmentStatus: seat.fulfillment_status as TrainingOnlyExecSeat["fulfillmentStatus"],
    classDate: seat.class_date,
    classNotes: seat.class_notes,
    sentAt: seat.sent_at,
    sentToEmail: seat.sent_to_email,
    accessUserId: seat.access_user_id,
    includesThirtyDay: trainingOnlyIncludesThirtyDay(seat.sku),
    includesClassSeat: trainingOnlyIncludesClassSeat(seat.sku),
  };
}

export const listTrainingOnlyOrdersForExec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingOnlyExecSeat[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
    await ensureHiveExecutive(supabase as AnySupabase, userId);

    const admin = supabaseAdmin as AnySupabase;
    const { data: orders, error } = await admin
      .from("training_only_orders")
      .select("id, buyer_email, buyer_agency_name, payment_status, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (MISSING_TABLE.test(error.message ?? "")) return [];
      throw new Error(error.message);
    }
    const orderRows = (orders ?? []) as Array<{
      id: string;
      buyer_email: string;
      buyer_agency_name: string | null;
      payment_status: string;
      paid_at: string | null;
      created_at: string;
    }>;
    if (!orderRows.length) return [];

    const { data: seats, error: seatErr } = await admin
      .from("training_only_seats")
      .select(
        "id, order_id, person_name, sku, unit_price_cents, fulfillment_status, class_date, class_notes, sent_at, sent_to_email, access_user_id, created_at",
      )
      .in(
        "order_id",
        orderRows.map((o) => o.id),
      )
      .order("created_at", { ascending: true });
    if (seatErr) {
      if (MISSING_TABLE.test(seatErr.message ?? "")) return [];
      throw new Error(seatErr.message);
    }

    const byOrder = new Map(orderRows.map((o) => [o.id, o]));
    const out: TrainingOnlyExecSeat[] = [];
    for (const seat of (seats ?? []) as Array<{
      id: string;
      order_id: string;
      person_name: string;
      sku: string;
      unit_price_cents: number;
      fulfillment_status: string;
      class_date: string | null;
      class_notes: string | null;
      sent_at: string | null;
      sent_to_email: string | null;
      access_user_id: string | null;
    }>) {
      const order = byOrder.get(seat.order_id);
      if (!order) continue;
      const mapped = mapSeat(order, seat);
      if (mapped) out.push(mapped);
    }
    return out;
  });

export const setupTrainingOnlySeatFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        seatId: z.string().uuid(),
        classDate: z.string().trim().max(32).nullable().optional(),
        classNotes: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not signed in.");
    await ensureHiveExecutive(supabase as AnySupabase, userId);

    const classDate = data.classDate && /^\d{4}-\d{2}-\d{2}$/.test(data.classDate) ? data.classDate : null;
    const classNotes = (data.classNotes ?? "").trim() || null;
    const nowIso = new Date().toISOString();
    const admin = supabaseAdmin as AnySupabase;
    const { data: current, error: readErr } = await admin
      .from("training_only_seats")
      .select("id, fulfillment_status")
      .eq("id", data.seatId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Seat not found.");

    const nextStatus =
      current.fulfillment_status === "sent" || current.fulfillment_status === "completed"
        ? current.fulfillment_status
        : classDate
          ? "scheduled"
          : "awaiting_setup";

    const { error } = await admin
      .from("training_only_seats")
      .update({
        class_date: classDate,
        class_notes: classNotes,
        fulfillment_status: nextStatus,
        updated_at: nowIso,
      })
      .eq("id", data.seatId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function classDetailText(seat: {
  personName: string;
  skuLabel: string;
  sku: TrainingOnlySku;
  classDate: string | null;
  classNotes: string | null;
  includesThirtyDay: boolean;
}): { subject: string; text: string; html: string } {
  const dateLine = seat.classDate
    ? `Class date: ${seat.classDate}.`
    : "The office will confirm the class date.";
  const notes = seat.classNotes ? `\n\n${seat.classNotes}` : "";
  const pack =
    seat.sku === "pack"
      ? " Pack covers CPR / First Aid, the 30-day course, and Mandt for this person."
      : "";
  const thirty = seat.includesThirtyDay
    ? " Sign in at the training-only page to open the 30-day course. This is not an office login."
    : "";
  const subject = `Your ${seat.skuLabel} training — ${seat.personName}`;
  const text = `Hello ${seat.personName},\n\nYour ${seat.skuLabel} seat is ready.${pack}\n${dateLine}${thirty}${notes}\n\nProvider Interface Training`;
  const html = `<p>Hello ${escapeHtml(seat.personName)},</p><p>Your ${escapeHtml(seat.skuLabel)} seat is ready.${pack}</p><p>${escapeHtml(dateLine)}${thirty}</p>${seat.classNotes ? `<p>${escapeHtml(seat.classNotes)}</p>` : ""}<p>Provider Interface Training</p>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function provisionThirtyDayLogin(email: string, personName: string): Promise<string | null> {
  const admin = supabaseAdmin as AnySupabase;
  const redirectTo = authRedirectUrl("/training/course");

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing?.id) {
    const { data: mems } = await admin
      .from("organization_members")
      .select("id")
      .eq("user_id", existing.id)
      .eq("active", true)
      .limit(1);
    if (mems && mems.length > 0) {
      // Existing office user — do not attach them to a company from this path.
      // They can still open /training/course if we set access_user_id.
      return existing.id as string;
    }
    try {
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
    } catch (err) {
      console.error("training-only magic link skipped:", err);
    }
    return existing.id as string;
  }

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: personName, created_via: "training_only" },
    redirectTo,
  });
  if (inviteErr) {
    console.error("training-only invite failed:", inviteErr.message);
    return null;
  }
  const userId = invited.user?.id ?? null;
  if (userId) {
    await admin.from("profiles").upsert(
      { id: userId, email, full_name: personName },
      { onConflict: "id" },
    );
  }
  return userId;
}

async function sendSeatEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const admin = supabaseAdmin as AnySupabase;
  const { data: invoke, error } = await admin.functions.invoke("send-email", {
    body: {
      from: `Provider Interface Training <${HIVE_MANAGED_FROM_ADDRESS}>`,
      to,
      subject,
      text,
      html,
    },
  });
  if (error || (invoke && invoke.ok === false)) {
    throw new Error(error?.message || invoke?.error || "Could not send the training email.");
  }
}

export const sendTrainingOnlySeatFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        seatId: z.string().uuid(),
        sendToEmail: z.string().trim().email().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; sentTo: string }> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) throw new Error("Not signed in.");
    await ensureHiveExecutive(supabase as AnySupabase, userId);

    const admin = supabaseAdmin as AnySupabase;
    const { data: seat, error: seatErr } = await admin
      .from("training_only_seats")
      .select(
        "id, order_id, person_name, person_email, sku, fulfillment_status, class_date, class_notes, access_user_id",
      )
      .eq("id", data.seatId)
      .maybeSingle();
    if (seatErr) throw new Error(seatErr.message);
    if (!seat) throw new Error("Seat not found.");
    if (!isTrainingOnlySku(seat.sku)) throw new Error("Unknown training SKU.");

    const { data: order, error: orderErr } = await admin
      .from("training_only_orders")
      .select("id, buyer_email, payment_status")
      .eq("id", seat.order_id)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Order not found.");
    if (order.payment_status !== "paid") {
      throw new Error("This seat is unpaid. Wait for Stripe, then send.");
    }

    const sendTo = normalizeBuyerEmail(data.sendToEmail || seat.person_email || order.buyer_email);
    if (!isValidBuyerEmail(sendTo)) throw new Error("Enter a valid email to send to.");

    let accessUserId = (seat.access_user_id as string | null) ?? null;
    if (trainingOnlyIncludesThirtyDay(seat.sku)) {
      accessUserId = (await provisionThirtyDayLogin(sendTo, seat.person_name)) ?? accessUserId;
    }

    const copy = classDetailText({
      personName: seat.person_name,
      skuLabel: trainingOnlySkuLabel(seat.sku),
      sku: seat.sku,
      classDate: seat.class_date,
      classNotes: seat.class_notes,
      includesThirtyDay: trainingOnlyIncludesThirtyDay(seat.sku),
    });
    await sendSeatEmail(sendTo, copy.subject, copy.text, copy.html);

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("training_only_seats")
      .update({
        person_email: sendTo,
        sent_to_email: sendTo,
        sent_at: nowIso,
        sent_by: userId,
        access_user_id: accessUserId && UUID_RE.test(accessUserId) ? accessUserId : null,
        fulfillment_status: "sent",
        updated_at: nowIso,
      })
      .eq("id", data.seatId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, sentTo: sendTo };
  });
