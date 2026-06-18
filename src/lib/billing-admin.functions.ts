// Org-admin gated wrappers around billing-lockout helpers. Used by the
// payment/settings page so an admin can "Pay now" against an open past-due
// balance and (in dev mode) simulate the full lockout/notification flow.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ORG = z.string().uuid();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureOrgAdmin(supabase: any, userId: string, orgId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data.role !== "admin" && data.role !== "super_admin")) {
    throw new Error("Forbidden — admin role required");
  }
}

export const adminRecordPaymentSuccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; amount_cents: number }) =>
    z.object({ organization_id: ORG, amount_cents: z.number().int().nonnegative() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureOrgAdmin(context.supabase, context.userId, data.organization_id);
    const { recordPaymentSuccess } = await import("./billing-lockout.server");
    return recordPaymentSuccess(data.organization_id, data.amount_cents, null);
  });

export const adminRecordPaymentFailureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; reason: string }) =>
    z.object({ organization_id: ORG, reason: z.string().trim().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureOrgAdmin(context.supabase, context.userId, data.organization_id);
    const { recordPaymentFailure } = await import("./billing-lockout.server");
    return recordPaymentFailure(data.organization_id, data.reason, null);
  });

export const adminLockAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; reason: string }) =>
    z.object({ organization_id: ORG, reason: z.string().trim().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureOrgAdmin(context.supabase, context.userId, data.organization_id);
    const { lockAccount } = await import("./billing-lockout.server");
    return lockAccount(data.organization_id, data.reason);
  });

export const adminUnlockAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) => z.object({ organization_id: ORG }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureOrgAdmin(context.supabase, context.userId, data.organization_id);
    const { unlockAccount } = await import("./billing-lockout.server");
    return unlockAccount(data.organization_id);
  });

// Simulate a 45-day-out expiry warning. updateCardExpiry will write a
// card_expiry_warning event because the new date is within 60 days.
export const adminSimulateCardExpiryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) => z.object({ organization_id: ORG }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureOrgAdmin(context.supabase, context.userId, data.organization_id);
    const { updateCardExpiry } = await import("./billing-lockout.server");
    const d = new Date();
    d.setDate(d.getDate() + 45);
    const iso = d.toISOString().slice(0, 10);
    return updateCardExpiry(data.organization_id, iso);
  });
