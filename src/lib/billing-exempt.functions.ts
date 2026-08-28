/**
 * Hive Exec: mark a company billing-exempt (comped) so they never hit Checkout.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { UNPAID_LOCK_REASON } from "@/lib/billing-access";

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function ensureExecutive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("hive_executives")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Access denied — HIVE Executive permission required.");
}

export const setOrgBillingExemptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; billingExempt: boolean }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization.");
    return { organizationId, billingExempt: input?.billingExempt === true };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) return { ok: false };
    await ensureExecutive(context.supabase, context.userId);

    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ billing_exempt: data.billingExempt })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);

    const { data: sub } = await supabaseAdmin
      .from("org_subscriptions")
      .select("id, stripe_subscription_id, status")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (data.billingExempt) {
      if (sub) {
        await supabaseAdmin
          .from("org_subscriptions")
          .update({
            locked_at: null,
            lock_reason: null,
            past_due_since: null,
            status: "active",
          })
          .eq("id", sub.id);
      } else {
        await supabaseAdmin.from("org_subscriptions").insert({
          organization_id: data.organizationId,
          plan: "enterprise",
          status: "active",
          mrr_cents: 0,
          locked_at: null,
          lock_reason: null,
        });
      }
    } else if (sub && !sub.stripe_subscription_id) {
      await supabaseAdmin
        .from("org_subscriptions")
        .update({
          locked_at: new Date().toISOString(),
          lock_reason: UNPAID_LOCK_REASON,
          status: "paused",
        })
        .eq("id", sub.id);
    }

    await supabaseAdmin.from("hive_executive_audit_log").insert({
      actor_user_id: context.userId,
      action: data.billingExempt ? "billing_exempt_on" : "billing_exempt_off",
      target_org_id: data.organizationId,
      summary: data.billingExempt
        ? "Marked company billing-exempt (comped — no Stripe charges)"
        : "Removed billing-exempt; unpaid companies lock until Checkout",
    });

    return { ok: true };
  });
