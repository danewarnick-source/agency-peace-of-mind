// Authenticated wrappers around billing-lockout.server.ts.
//
// Webhook handlers and cron jobs should import the server-side helpers
// directly (see ./billing-lockout.server.ts). These createServerFn wrappers
// are for the admin/HIVE-executive UI: testing, manual unlocks, etc.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ORG_ID = z.string().uuid();

async function ensureHiveExecutive(
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
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied — HIVE Executive permission required.");
}

export const recordPaymentFailureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; reason: string; stripe_event_id?: string | null }) =>
    z
      .object({
        organization_id: ORG_ID,
        reason: z.string().trim().min(1).max(500),
        stripe_event_id: z.string().trim().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { recordPaymentFailure } = await import("./billing-lockout.server");
    return recordPaymentFailure(data.organization_id, data.reason, data.stripe_event_id ?? null);
  });

export const recordPaymentSuccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; amount_cents: number; stripe_event_id?: string | null }) =>
    z
      .object({
        organization_id: ORG_ID,
        amount_cents: z.number().int().nonnegative(),
        stripe_event_id: z.string().trim().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { recordPaymentSuccess } = await import("./billing-lockout.server");
    return recordPaymentSuccess(data.organization_id, data.amount_cents, data.stripe_event_id ?? null);
  });

export const lockAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; reason: string }) =>
    z.object({ organization_id: ORG_ID, reason: z.string().trim().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { lockAccount } = await import("./billing-lockout.server");
    return lockAccount(data.organization_id, data.reason);
  });

export const unlockAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string }) =>
    z.object({ organization_id: ORG_ID }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { unlockAccount } = await import("./billing-lockout.server");
    return unlockAccount(data.organization_id);
  });

export const updateCardExpiryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organization_id: string; expires_at: string }) =>
    z
      .object({
        organization_id: ORG_ID,
        expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { updateCardExpiry } = await import("./billing-lockout.server");
    return updateCardExpiry(data.organization_id, data.expires_at);
  });

export const checkAndLockPastDueAccountsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { checkAndLockPastDueAccounts } = await import("./billing-lockout.server");
    return checkAndLockPastDueAccounts();
  });

export const checkCardExpiryWarningsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureHiveExecutive(context.supabase, context.userId);
    const { checkCardExpiryWarnings } = await import("./billing-lockout.server");
    return checkCardExpiryWarnings();
  });
