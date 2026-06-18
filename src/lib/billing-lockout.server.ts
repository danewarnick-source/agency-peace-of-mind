// Billing state-transition logic. Pure server-side helpers used by:
//   - createServerFn wrappers in billing-lockout.functions.ts (admin/exec UI)
//   - Stripe webhook handlers under src/routes/api/public/* (Part 6)
//   - Scheduled cron endpoints (checkAndLockPastDueAccounts, checkCardExpiryWarnings)
//
// All writes go through supabaseAdmin because callers include unauthenticated
// webhooks and cron jobs. Idempotency keys on payment_events.stripe_event_id
// prevent duplicate state changes when Stripe retries deliver the same event.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendBillingEmail } from "./billing-notifications.server";
import { sendBillingSms } from "./billing-sms.server";

export type PaymentEventType =
  | "payment_failed"
  | "payment_succeeded"
  | "payment_retried"
  | "card_expiry_warning"
  | "card_updated"
  | "account_locked"
  | "account_unlocked"
  | "subscription_created"
  | "subscription_cancelled"
  | "stripe_webhook_received";

interface EventInput {
  org_id: string;
  event_type: PaymentEventType;
  amount_cents?: number | null;
  failure_reason?: string | null;
  stripe_event_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Returns true if the event was inserted; false if a row with the same
 * stripe_event_id already existed (idempotent no-op). */
async function writePaymentEvent(input: EventInput): Promise<boolean> {
  if (input.stripe_event_id) {
    const { data: existing } = await supabaseAdmin
      .from("payment_events")
      .select("id")
      .eq("stripe_event_id", input.stripe_event_id)
      .maybeSingle();
    if (existing) return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any).from("payment_events").insert({
    org_id: input.org_id,
    event_type: input.event_type,
    amount_cents: input.amount_cents ?? null,
    failure_reason: input.failure_reason ?? null,
    stripe_event_id: input.stripe_event_id ?? null,
    metadata: input.metadata ?? null,
  });
  if (error) throw new Error(error.message);
  return true;
}

async function getActiveSubscription(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Failure 1 → +3 days, 2 → +4 days, 3 → +7 days, 4+ → +7 days. */
function computeNextRetry(failureCount: number): Date {
  const days = failureCount <= 1 ? 3 : failureCount === 2 ? 4 : 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ───── recordPaymentFailure ──────────────────────────────────────────────
export async function recordPaymentFailure(
  orgId: string,
  reason: string,
  stripeEventId?: string | null,
): Promise<{ ok: boolean; idempotent?: boolean; failure_count?: number }> {
  if (stripeEventId) {
    const { data: existing } = await supabaseAdmin
      .from("payment_events")
      .select("id")
      .eq("stripe_event_id", stripeEventId)
      .maybeSingle();
    if (existing) return { ok: true, idempotent: true };
  }

  const sub = await getActiveSubscription(orgId);
  if (!sub) throw new Error("No subscription found for organization");

  const now = new Date();
  const nextFailureCount = (sub.failure_count ?? 0) + 1;
  const nextRetryAt = computeNextRetry(nextFailureCount);

  const { error: updErr } = await supabaseAdmin
    .from("org_subscriptions")
    .update({
      past_due_since: sub.past_due_since ?? now.toISOString(),
      failure_count: nextFailureCount,
      last_payment_attempt_at: now.toISOString(),
      last_payment_error: reason,
      next_retry_at: nextRetryAt.toISOString(),
    })
    .eq("id", sub.id);
  if (updErr) throw new Error(updErr.message);

  await writePaymentEvent({
    org_id: orgId,
    event_type: "payment_failed",
    failure_reason: reason,
    stripe_event_id: stripeEventId ?? null,
    metadata: { failure_count: nextFailureCount, next_retry_at: nextRetryAt.toISOString() },
  });

  await sendBillingEmail({
    orgId,
    kind: "payment_failed",
    data: { reason },
  });

  // SMS day-0 declined notice (highest urgency).
  await sendBillingSms({
    orgId,
    kind: "payment_declined_day0",
    amountCents: sub.mrr_cents ?? null,
  });

  return { ok: true, failure_count: nextFailureCount };
}

// ───── recordPaymentSuccess ──────────────────────────────────────────────
export async function recordPaymentSuccess(
  orgId: string,
  amountCents: number,
  stripeEventId?: string | null,
): Promise<{ ok: boolean; idempotent?: boolean; was_locked: boolean }> {
  if (stripeEventId) {
    const { data: existing } = await supabaseAdmin
      .from("payment_events")
      .select("id")
      .eq("stripe_event_id", stripeEventId)
      .maybeSingle();
    if (existing) return { ok: true, idempotent: true, was_locked: false };
  }

  const sub = await getActiveSubscription(orgId);
  if (!sub) throw new Error("No subscription found for organization");
  const wasLocked = !!sub.locked_at;

  const { error: updErr } = await supabaseAdmin
    .from("org_subscriptions")
    .update({
      past_due_since: null,
      locked_at: null,
      lock_reason: null,
      last_payment_error: null,
      failure_count: 0,
      next_retry_at: null,
      last_payment_attempt_at: new Date().toISOString(),
    })
    .eq("id", sub.id);
  if (updErr) throw new Error(updErr.message);

  await writePaymentEvent({
    org_id: orgId,
    event_type: "payment_succeeded",
    amount_cents: amountCents,
    stripe_event_id: stripeEventId ?? null,
  });

  if (wasLocked) {
    await writePaymentEvent({
      org_id: orgId,
      event_type: "account_unlocked",
      metadata: { reason: "payment_succeeded" },
    });
    await sendBillingEmail({ orgId, kind: "account_restored" });
  }

  return { ok: true, was_locked: wasLocked };
}

// ───── lockAccount ───────────────────────────────────────────────────────
export async function lockAccount(orgId: string, reason: string): Promise<{ ok: boolean }> {
  const sub = await getActiveSubscription(orgId);
  if (!sub) throw new Error("No subscription found for organization");

  const { error: updErr } = await supabaseAdmin
    .from("org_subscriptions")
    .update({
      locked_at: new Date().toISOString(),
      lock_reason: reason,
    })
    .eq("id", sub.id);
  if (updErr) throw new Error(updErr.message);

  await writePaymentEvent({
    org_id: orgId,
    event_type: "account_locked",
    failure_reason: reason,
  });

  await Promise.all([
    sendBillingEmail({ orgId, kind: "account_locked", data: { reason } }),
    sendBillingEmail({ orgId, kind: "account_locked_staff", data: { reason } }),
    sendBillingSms({ orgId, kind: "account_locked" }),
  ]);

  return { ok: true };
}

// ───── unlockAccount ─────────────────────────────────────────────────────
export async function unlockAccount(orgId: string): Promise<{ ok: boolean }> {
  const sub = await getActiveSubscription(orgId);
  if (!sub) throw new Error("No subscription found for organization");

  const { error: updErr } = await supabaseAdmin
    .from("org_subscriptions")
    .update({ locked_at: null, lock_reason: null })
    .eq("id", sub.id);
  if (updErr) throw new Error(updErr.message);

  await writePaymentEvent({
    org_id: orgId,
    event_type: "account_unlocked",
  });

  return { ok: true };
}

// ───── checkAndLockPastDueAccounts ───────────────────────────────────────
export async function checkAndLockPastDueAccounts(): Promise<{
  locked: number;
  org_ids: string[];
  warned_9day: number;
}> {
  const now = Date.now();
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("id, organization_id, past_due_since")
    .is("locked_at", null)
    .not("past_due_since", "is", null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ organization_id: string; past_due_since: string }>;
  const lockedIds: string[] = [];
  let warned9day = 0;
  for (const row of rows) {
    const pastDueMs = new Date(row.past_due_since).getTime();
    const daysPastDue = Math.floor((now - pastDueMs) / 86_400_000);

    if (row.past_due_since < cutoff) {
      try {
        await lockAccount(row.organization_id, "Payment past due > 30 days");
        lockedIds.push(row.organization_id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[checkAndLockPastDueAccounts] failed to lock", row.organization_id, err);
      }
      continue;
    }

    // Day-21 SMS — 9 days before lockout. Send once in the 21-22 day window;
    // sendBillingSms dedupes via payment_events so re-running the cron is safe.
    if (daysPastDue >= 21 && daysPastDue < 23) {
      const r = await sendBillingSms({
        orgId: row.organization_id,
        kind: "payment_declined_day21",
      });
      if (r.sent) warned9day += 1;
    }
  }
  return { locked: lockedIds.length, org_ids: lockedIds, warned_9day: warned9day };
}

// ───── updateCardExpiry ──────────────────────────────────────────────────
export async function updateCardExpiry(
  orgId: string,
  expiresAt: string,
): Promise<{ ok: boolean; warned: boolean }> {
  const sub = await getActiveSubscription(orgId);
  if (!sub) throw new Error("No subscription found for organization");

  const { error: updErr } = await supabaseAdmin
    .from("org_subscriptions")
    .update({ card_expires_at: expiresAt })
    .eq("id", sub.id);
  if (updErr) throw new Error(updErr.message);

  const daysUntil = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  let warned = false;
  if (daysUntil <= 60 && daysUntil >= 0) {
    await writePaymentEvent({
      org_id: orgId,
      event_type: "card_expiry_warning",
      metadata: { days_until: daysUntil, expires_at: expiresAt, tier: "informational" },
    });
    warned = true;
  }

  return { ok: true, warned };
}

// ───── checkCardExpiryWarnings ───────────────────────────────────────────
export async function checkCardExpiryWarnings(): Promise<{ warned: number; org_ids: string[] }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("organization_id, card_expires_at")
    .not("card_expires_at", "is", null)
    .gte("card_expires_at", now.toISOString().slice(0, 10))
    .lte("card_expires_at", horizon.toISOString().slice(0, 10));
  if (error) throw new Error(error.message);

  const warned: string[] = [];
  for (const row of data ?? []) {
    const daysUntil = Math.ceil(
      (new Date(row.card_expires_at as string).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );

    // Pick tier — only send the strongest threshold the card has crossed.
    let tier: "60" | "30" | "7" | null = null;
    let kind: "card_expiry_60" | "card_expiry_30" | "card_expiry_7" | null = null;
    if (daysUntil <= 7) {
      tier = "7";
      kind = "card_expiry_7";
    } else if (daysUntil <= 30) {
      tier = "30";
      kind = "card_expiry_30";
    } else if (daysUntil <= 60) {
      tier = "60";
      kind = "card_expiry_60";
    }
    if (!tier || !kind) continue;

    // De-dupe: skip if we already emitted this tier in the last 7 days.
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("payment_events")
      .select("id, metadata")
      .eq("org_id", row.organization_id)
      .eq("event_type", "card_expiry_warning")
      .gte("created_at", sinceIso);
    const alreadyWarned = (recent ?? []).some(
      (e) => (e.metadata as { tier?: string } | null)?.tier === tier,
    );
    if (alreadyWarned) continue;

    await writePaymentEvent({
      org_id: row.organization_id,
      event_type: "card_expiry_warning",
      metadata: { tier, days_until: daysUntil, expires_at: row.card_expires_at },
    });
    await sendBillingEmail({
      orgId: row.organization_id,
      kind,
      data: { daysRemaining: daysUntil, cardExpiresOn: String(row.card_expires_at) },
    });
    warned.push(row.organization_id);
  }

  return { warned: warned.length, org_ids: warned };
}
