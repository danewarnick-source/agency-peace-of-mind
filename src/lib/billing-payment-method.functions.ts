// Authenticated server function for admins to update their org's payment
// method from the in-app billing banner. PCI: we do NOT persist card data —
// we only record the card_updated event and the new card_expires_at, and
// (if the org is past due / locked) optimistically clear the past-due state
// so service is restored immediately. A real Stripe integration would attach
// the new payment method and retry the failed invoice here.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  organization_id: z.string().uuid(),
  cardholder_name: z.string().trim().min(1).max(120),
  last4: z.string().regex(/^\d{4}$/, "expected 4 digits"),
  exp_month: z.number().int().min(1).max(12),
  exp_year: z.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 25),
  postal_code: z.string().trim().min(3).max(20),
});

export const updatePaymentMethodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof InputSchema>) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Authorize: caller must be an active admin/super_admin of this org.
    const { data: membership, error: mErr } = await context.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organization_id)
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!membership || (membership.role !== "admin" && membership.role !== "super_admin")) {
      throw new Error("Forbidden — admin role required to update payment method");
    }

    // expires_at = last day of the expiry month (YYYY-MM-DD)
    const lastDay = new Date(Date.UTC(data.exp_year, data.exp_month, 0));
    const expiresAt = lastDay.toISOString().slice(0, 10);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub, error: sErr } = await supabaseAdmin
      .from("org_subscriptions")
      .select("*")
      .eq("organization_id", data.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sub) throw new Error("No subscription found for organization");

    const wasPastDue = !!sub.past_due_since || !!sub.locked_at;

    // Update card + (optimistically) clear past-due/lock state. A real
    // Stripe webhook on the successful retry would do the same thing.
    const { error: updErr } = await supabaseAdmin
      .from("org_subscriptions")
      .update({
        card_expires_at: expiresAt,
        ...(wasPastDue
          ? {
              past_due_since: null,
              locked_at: null,
              lock_reason: null,
              last_payment_error: null,
              failure_count: 0,
              next_retry_at: null,
              last_payment_attempt_at: new Date().toISOString(),
            }
          : {}),
      })
      .eq("id", sub.id);
    if (updErr) throw new Error(updErr.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("payment_events").insert({
      org_id: data.organization_id,
      event_type: "card_updated",
      metadata: {
        last4: data.last4,
        cardholder_name: data.cardholder_name,
        exp_month: data.exp_month,
        exp_year: data.exp_year,
        postal_code: data.postal_code,
        was_past_due: wasPastDue,
      },
    });

    if (wasPastDue) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).from("payment_events").insert({
        org_id: data.organization_id,
        event_type: "account_unlocked",
        metadata: { reason: "payment_method_updated" },
      });
    }

    return { ok: true, was_past_due: wasPastDue, card_expires_at: expiresAt };
  });
