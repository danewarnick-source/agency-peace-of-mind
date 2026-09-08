/**
 * Server check: may this staff open the in-Hive 30-day course?
 * Roster tables are admin-only RLS — use the admin client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isBillingExempt } from "@/lib/billing-access";
import { isTrainingOnlySku, trainingOnlyIncludesThirtyDay } from "@/lib/training-only";
import {
  resolveThirtyDayAccess,
  rosterPaymentUnlocksThirtyDay,
  rosterTypeUnlocksThirtyDay,
  staffMatchesRosterRow,
  type ThirtyDayAccessReason,
} from "@/lib/in-hive-training-access";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const MISSING = /schema cache|does not exist|training_class/i;

export type ThirtyDayCourseAccess = {
  allowed: boolean;
  reason: ThirtyDayAccessReason;
  charged: boolean;
  organizationName: string;
};

export const thirtyDayCourseAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ThirtyDayCourseAccess> => {
    const { userId } = context;
    const empty: ThirtyDayCourseAccess = {
      allowed: false,
      reason: "denied",
      charged: false,
      organizationName: "Provider agency",
    };
    if (!userId) return empty;
    const admin = supabaseAdmin as AnySupabase;

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, name, legal_name, dba_name, display_acronym, billing_exempt")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    if (!org) return empty;

    const organizationName = String(org.name ?? "Provider agency");
    const billingExempt = isBillingExempt({
      billingExempt: org.billing_exempt === true,
      orgName: org.name,
      legalName: org.legal_name,
      dbaName: org.dba_name,
      organizationId: org.id,
      displayAcronym: org.display_acronym,
    });

    const { data: prof } = await admin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const email = (prof?.email as string | null) ?? null;

    let hasPaidRosterSeat = false;
    const { data: classes, error: clsErr } = await admin
      .from("training_classes")
      .select("id, training_type, payment_status")
      .eq("organization_id", data.organizationId);
    if (clsErr && !MISSING.test(clsErr.message ?? "")) throw new Error(clsErr.message);
    const classIds = ((classes ?? []) as Array<{
      id: string;
      training_type: string;
      payment_status: string;
    }>)
      .filter(
        (c) =>
          rosterTypeUnlocksThirtyDay(c.training_type) &&
          rosterPaymentUnlocksThirtyDay(c.payment_status),
      )
      .map((c) => c.id);

    if (classIds.length) {
      const { data: roster, error: rosErr } = await admin
        .from("training_class_roster")
        .select("staff_user_id, staff_email")
        .in("class_id", classIds);
      if (rosErr && !MISSING.test(rosErr.message ?? "")) throw new Error(rosErr.message);
      hasPaidRosterSeat = ((roster ?? []) as Array<{
        staff_user_id: string | null;
        staff_email: string | null;
      }>).some((row) =>
        staffMatchesRosterRow(
          { userId, email },
          { staffUserId: row.staff_user_id, staffEmail: row.staff_email },
        ),
      );
    }

    let hasTrainingOnlySeat = false;
    const { data: seats, error: seatErr } = await admin
      .from("training_only_seats")
      .select("sku, order_id")
      .eq("access_user_id", userId);
    if (seatErr && !MISSING.test(seatErr.message ?? "")) throw new Error(seatErr.message);
    const seatRows = (seats ?? []) as Array<{ sku: string; order_id: string }>;
    if (seatRows.length) {
      const orderIds = [...new Set(seatRows.map((s) => s.order_id))];
      const { data: orders, error: orderErr } = await admin
        .from("training_only_orders")
        .select("id, payment_status")
        .in("id", orderIds);
      if (orderErr && !MISSING.test(orderErr.message ?? "")) throw new Error(orderErr.message);
      const paid = new Set(
        ((orders ?? []) as Array<{ id: string; payment_status: string }>)
          .filter((o) => o.payment_status === "paid")
          .map((o) => o.id),
      );
      hasTrainingOnlySeat = seatRows.some(
        (s) =>
          paid.has(s.order_id) &&
          isTrainingOnlySku(s.sku) &&
          trainingOnlyIncludesThirtyDay(s.sku),
      );
    }

    const resolved = resolveThirtyDayAccess({
      billingExempt,
      hasPaidRosterSeat,
      hasTrainingOnlySeat,
    });
    return { ...resolved, organizationName };
  });
