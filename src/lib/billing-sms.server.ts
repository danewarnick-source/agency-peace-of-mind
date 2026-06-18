// Billing SMS dispatch (Twilio).
//
// SMS is the second channel for the highest-urgency billing events only —
// payment declined (day 0), 9-day-to-lockout warning, account locked, and
// card expiring in 7 days. DSPD directors are often in the field and miss
// email; a text reaches them immediately.
//
// Idempotency: every send writes a `payment_events` row with
// event_type='sms_sent' and metadata.kind=<kind>. Before sending we look
// for an existing row with the same kind in the last 23 hours and skip if
// found. This makes the daily cron safe to re-run.
//
// Twilio config is read from env at call time:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
// If any are missing, the function logs the message content and returns
// without failing — billing state transitions must never break because SMS
// infrastructure is offline.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BillingSmsKind =
  | "payment_declined_day0"
  | "payment_declined_day21"
  | "account_locked"
  | "card_expiring_7";

export interface SendBillingSmsInput {
  orgId: string;
  kind: BillingSmsKind;
  amountCents?: number | null;
}

const BILLING_LINK_PATH = "/dashboard/settings/subscription";

function fmtAmount(cents: number | null | undefined): string {
  if (cents == null) return "your latest";
  return `$${(cents / 100).toFixed(2)}`;
}

function buildBody(kind: BillingSmsKind, amountCents: number | null | undefined, link: string): string {
  switch (kind) {
    case "payment_declined_day0":
      return `Hive: Your ${fmtAmount(amountCents)} payment was declined. Update your card to keep your team's access active: ${link}`;
    case "payment_declined_day21":
      return `Hive: Your account locks in 9 days. Your entire team will lose access until payment is processed. Update now: ${link}`;
    case "account_locked":
      return `Hive: Your agency's Hive account is now locked. All staff are signed out. Update payment to restore access immediately: ${link}`;
    case "card_expiring_7":
      return `Hive: Your card on file expires in 7 days. Update it now to avoid a payment failure: ${link}`;
  }
}

function getAppBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL ||
    "https://hive.lovable.app"
  ).replace(/\/$/, "");
}

async function getOrgPhone(orgId: string): Promise<{ phone: string | null; name: string | null }> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("name, billing_sms_phone")
    .eq("id", orgId)
    .maybeSingle();
  return {
    phone: (data as { billing_sms_phone: string | null } | null)?.billing_sms_phone ?? null,
    name: (data as { name: string | null } | null)?.name ?? null,
  };
}

async function alreadySentRecently(orgId: string, kind: BillingSmsKind): Promise<boolean> {
  const sinceIso = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("payment_events")
    .select("id, metadata")
    .eq("org_id", orgId)
    .eq("event_type", "sms_sent")
    .gte("created_at", sinceIso);
  return (data ?? []).some((r) => (r.metadata as { kind?: string } | null)?.kind === kind);
}

async function sendViaTwilio(to: string, from: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "no_credentials" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `twilio_${res.status}:${text.slice(0, 200)}` };
  }
  return { ok: true };
}

export async function sendBillingSms(input: SendBillingSmsInput): Promise<{
  sent: boolean;
  reason?: string;
}> {
  try {
    if (await alreadySentRecently(input.orgId, input.kind)) {
      return { sent: false, reason: "duplicate_within_24h" };
    }

    const { phone } = await getOrgPhone(input.orgId);
    if (!phone) return { sent: false, reason: "no_phone_on_file" };

    const link = `${getAppBaseUrl()}${BILLING_LINK_PATH}`;
    const body = buildBody(input.kind, input.amountCents ?? null, link);

    const from = process.env.TWILIO_FROM_NUMBER;
    const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && from);

    let sendOk = false;
    let sendError: string | undefined;
    if (hasTwilio) {
      const r = await sendViaTwilio(phone, from!, body);
      sendOk = r.ok;
      sendError = r.error;
      if (!sendOk) {
        // eslint-disable-next-line no-console
        console.error("[billing-sms:send-failed]", input.kind, input.orgId, sendError);
      }
    } else {
      // Dev / no-Twilio: log the body so flows are testable.
      // eslint-disable-next-line no-console
      console.log("[billing-sms:would-send]", input.kind, input.orgId, "→", phone, body);
      sendOk = true;
      sendError = "logged_only_no_twilio_env";
    }

    // Always record the attempt so the cron dedupe window applies even
    // when Twilio is not configured yet (prevents log spam on every run).
    const last4 = phone.replace(/\D/g, "").slice(-4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("payment_events").insert({
      org_id: input.orgId,
      event_type: "sms_sent",
      metadata: {
        kind: input.kind,
        phone_last4: last4,
        delivered: sendOk && !!hasTwilio,
        note: sendError ?? null,
      },
    });

    return { sent: sendOk && !!hasTwilio, reason: sendError };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[billing-sms:exception]", input.kind, input.orgId, err);
    return { sent: false, reason: "exception" };
  }
}
