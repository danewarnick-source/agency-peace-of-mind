// Billing email notifications.
//
// Part 2 stub: structured helper invoked by lockout/payment logic.
// Part 3 will flesh out templates and actual delivery via the shared
// `send-email` edge function. For now we resolve recipients and record
// the intent so callers wire correctly.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BillingEmailKind =
  | "payment_failed"
  | "account_locked"
  | "account_locked_staff"
  | "account_restored"
  | "card_expiry_60"
  | "card_expiry_30"
  | "card_expiry_7";

export interface BillingEmailContext {
  orgId: string;
  kind: BillingEmailKind;
  data?: Record<string, unknown>;
}

async function getOrgAdminEmails(orgId: string): Promise<string[]> {
  const { data: members } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("active", true)
    .in("role", ["admin", "super_admin"]);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .in("id", ids);
  return (profiles ?? []).map((p) => p.email).filter((e): e is string => !!e);
}

async function getOrgStaffEmails(orgId: string): Promise<string[]> {
  const { data: members } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("active", true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .in("id", ids);
  return (profiles ?? []).map((p) => p.email).filter((e): e is string => !!e);
}

/**
 * Resolve recipients and dispatch a billing email. Part 3 will replace the
 * console.log + edge-function shape with branded templates. Until then,
 * callers can rely on the recipient resolution and the fact that any send
 * failure will not throw — billing state changes must succeed even if email
 * fails (the payment_events row is the durable record).
 */
export async function sendBillingEmail(ctx: BillingEmailContext): Promise<{
  sent: boolean;
  recipients: string[];
}> {
  try {
    const recipients =
      ctx.kind === "account_locked_staff"
        ? await getOrgStaffEmails(ctx.orgId)
        : await getOrgAdminEmails(ctx.orgId);

    if (recipients.length === 0) {
      return { sent: false, recipients: [] };
    }

    // Part 3: render template + invoke send-email. Until then we log only.
    // eslint-disable-next-line no-console
    console.log("[billing-email]", ctx.kind, ctx.orgId, recipients.length, "recipient(s)");
    return { sent: true, recipients };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[billing-email] failed", ctx.kind, ctx.orgId, err);
    return { sent: false, recipients: [] };
  }
}
