/**
 * Hive Exec + signup helpers for list vs founding pricing.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isBillingExempt } from "@/lib/billing-access";
import {
  FOUNDING_ORG_CAP,
  foundingEndsAtFrom,
  signupScheduleFromPayingCount,
  type PricingSchedule,
} from "@/lib/hive-pricing";

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

export async function countPayingOrgs(): Promise<number> {
  const orgsFull = await supabaseAdmin
    .from("organizations")
    .select("id, name, legal_name, dba_name, billing_exempt");
  let orgs = orgsFull.data as Array<{
    id: string;
    name: string;
    legal_name: string | null;
    dba_name: string | null;
    billing_exempt?: boolean;
  }> | null;
  if (orgsFull.error) {
    if (!/billing_exempt/i.test(orgsFull.error.message ?? "")) throw orgsFull.error;
    const retry = await supabaseAdmin.from("organizations").select("id, name, legal_name, dba_name");
    if (retry.error) throw retry.error;
    orgs = retry.data as typeof orgs;
  }

  const { data: subs, error: subErr } = await supabaseAdmin
    .from("org_subscriptions")
    .select("organization_id, status, stripe_subscription_id");
  if (subErr) throw subErr;

  const exemptIds = new Set(
    (orgs ?? [])
      .filter((o) =>
        isBillingExempt({
          billingExempt: o.billing_exempt === true,
          orgName: o.name,
          legalName: o.legal_name,
          dbaName: o.dba_name,
        }),
      )
      .map((o) => o.id),
  );

  return (subs ?? []).filter((s) => {
    if (exemptIds.has(s.organization_id)) return false;
    const status = (s.status ?? "").toLowerCase();
    if (status !== "active" && status !== "past_due") return false;
    return !!(s as { stripe_subscription_id?: string | null }).stripe_subscription_id;
  }).length;
}

export const getSignupPricingFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const payingOrgCount = await countPayingOrgs();
    const schedule = signupScheduleFromPayingCount(payingOrgCount);
    return {
      payingOrgCount,
      foundingCap: FOUNDING_ORG_CAP,
      foundingSlotsRemaining: Math.max(0, FOUNDING_ORG_CAP - payingOrgCount),
      schedule,
    };
  });

export const setOrgPricingScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; schedule: PricingSchedule }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization.");
    const schedule = input?.schedule === "founding" ? "founding" : "list";
    return { organizationId, schedule };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) return { ok: false };
    await ensureExecutive(context.supabase, context.userId);

    const patch: { pricing_schedule: PricingSchedule; founding_ends_at?: string | null } = {
      pricing_schedule: data.schedule,
    };
    if (data.schedule === "founding") {
      const { data: row } = await supabaseAdmin
        .from("organizations")
        .select("founding_ends_at")
        .eq("id", data.organizationId)
        .maybeSingle();
      const existing = (row as { founding_ends_at?: string | null } | null)?.founding_ends_at ?? null;
      const stillOpen = existing && new Date(existing).getTime() > Date.now();
      patch.founding_ends_at = stillOpen ? existing : foundingEndsAtFrom();
    }

    const { error } = await supabaseAdmin
      .from("organizations")
      .update(patch)
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("hive_executive_audit_log").insert({
      actor_user_id: context.userId,
      action: data.schedule === "founding" ? "pricing_founding" : "pricing_list",
      target_org_id: data.organizationId,
      summary:
        data.schedule === "founding"
          ? "Marked company founding (internal schedule; checkout stays list $69 / client, $350 min)"
          : "Marked company list pricing ($69 / client, $350 min)",
    });

    return { ok: true, foundingEndsAt: patch.founding_ends_at ?? null };
  });
