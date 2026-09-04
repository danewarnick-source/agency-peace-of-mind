/**
 * Stripe Checkout + Customer Portal + training purchases.
 * Authenticated server functions. Never log secrets.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  entitlementsForOrg,
  isBillingExempt,
  orgAccessIsLocked,
  trainingRequiresCharge,
  UNPAID_LOCK_REASON,
} from "@/lib/billing-access";
import {
  PAYMENTS_NOT_CONFIGURED,
  isStripeLiveSecretKey,
  readStripeEnv,
  stripePaymentsConfigured,
  resolveAgencyCheckoutPricingModel,
  stripePriceIdForTrainingSku,
  stripeUnitAmountForTrainingSku,
  subscriptionLineItemsForPiListQuote,
  subscriptionLineItemsForQuote,
} from "@/lib/stripe-config";
import {
  isSignupTrainingAddonId,
  quotePiListSubscription,
  quoteSignupTrainingAddon,
  quoteSignupTrainingLines,
  trainingPeopleForCheckout,
  trainingQuantitiesFromPeople,
  type SignupTrainingAddonId,
} from "@/lib/pi-signup-pricing";
import { appOriginFromRequest, getStripe } from "@/lib/stripe.server";
import { activateSubscriptionFromCheckout } from "@/lib/stripe-webhook";
import { fulfillTrainingOrder } from "@/lib/training-fulfillment.server";
import { fulfillTrainingClass } from "@/lib/training-class-fulfillment.server";
import {
  cleanRosterRows,
  isTrainingClassType,
  quoteTrainingClass,
  trainingClassIsExternal,
  trainingClassLabel,
  validateRosterRows,
  type TrainingClassRosterRow,
  type TrainingClassType,
} from "@/lib/training-class";
import { countPayingOrgs } from "@/lib/hive-pricing.functions";
import { highWaterClientCount } from "@/lib/pi-list-billing.server";
import {
  clampClientCount,
  clampStaffCount,
  foundingEndsAtFrom,
  FOUNDING_ORG_CAP,
  quoteHiveSubscription,
  signupScheduleFromPayingCount,
  type BillingInterval,
  type HiveQuote,
  type PricingSchedule,
} from "@/lib/hive-pricing";

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function requireOrgAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "admin") {
    throw new Error("Only a company admin can manage billing.");
  }
}

type OrgBillingRow = {
  id: string;
  name: string;
  legalName: string | null;
  dbaName: string | null;
  billingExempt: boolean;
  pricingSchedule: PricingSchedule | null;
  foundingEndsAt: string | null;
  approxClientCount: number | null;
};

/** Session client first (preview has VITE_ URL/anon, often no service role). */
function billingDb(client: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

async function loadOrgRow(orgId: string, client: unknown): Promise<OrgBillingRow> {
  const db = billingDb(client);
  const full = await db
    .from("organizations")
    .select(
      "id, name, legal_name, dba_name, billing_exempt, pricing_schedule, founding_ends_at, approx_client_count",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (!full.error && full.data) {
    const row = full.data as {
      id: string;
      name: string;
      legal_name: string | null;
      dba_name: string | null;
      billing_exempt?: boolean;
      pricing_schedule?: string | null;
      founding_ends_at?: string | null;
      approx_client_count?: number | null;
    };
    return {
      id: row.id,
      name: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      billingExempt: row.billing_exempt === true,
      pricingSchedule: row.pricing_schedule === "founding" ? "founding" : row.pricing_schedule === "list" ? "list" : null,
      foundingEndsAt: row.founding_ends_at ?? null,
      approxClientCount: row.approx_client_count ?? null,
    };
  }
  const fallback = await db
    .from("organizations")
    .select("id, name, legal_name, dba_name, billing_exempt, approx_client_count")
    .eq("id", orgId)
    .maybeSingle();
  if (fallback.error || !fallback.data) {
    const basic = await db
      .from("organizations")
      .select("id, name, legal_name, dba_name")
      .eq("id", orgId)
      .maybeSingle();
    if (basic.error || !basic.data) throw new Error("Organization not found.");
    const row = basic.data as {
      id: string;
      name: string;
      legal_name: string | null;
      dba_name: string | null;
    };
    return {
      id: row.id,
      name: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      billingExempt: false,
      pricingSchedule: null,
      foundingEndsAt: null,
      approxClientCount: null,
    };
  }
  const row = fallback.data as {
    id: string;
    name: string;
    legal_name: string | null;
    dba_name: string | null;
    billing_exempt?: boolean;
    approx_client_count?: number | null;
  };
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    dbaName: row.dba_name,
    billingExempt: row.billing_exempt === true,
    pricingSchedule: null,
    foundingEndsAt: null,
    approxClientCount: row.approx_client_count ?? null,
  };
}

function orgIsComped(org: OrgBillingRow): boolean {
  return isBillingExempt({
    billingExempt: org.billingExempt,
    orgName: org.name,
    legalName: org.legalName,
    dbaName: org.dbaName,
    organizationId: org.id,
  });
}

async function liveUsageCounts(orgId: string, client: unknown): Promise<{ staff: number; clients: number }> {
  const db = billingDb(client);
  let staff = 0;
  try {
    const staffRes = await db
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("active", true);
    staff = staffRes.count ?? 0;
  } catch {
    staff = 0;
  }
  try {
    const { readSupabaseAdminEnv } = await import("@/lib/supabase-public-env");
    if (readSupabaseAdminEnv()) {
      const highWater = await highWaterClientCount(orgId);
      return { staff, clients: highWater.count };
    }
  } catch {
    /* preview often has VITE_ keys only — use the roster count below */
  }
  return { staff, clients: 0 };
}

async function resolveOrgSchedule(
  org: OrgBillingRow,
  client: unknown,
): Promise<{
  schedule: PricingSchedule;
  foundingEndsAt: string | null;
}> {
  if (org.pricingSchedule === "founding" || org.pricingSchedule === "list") {
    return { schedule: org.pricingSchedule, foundingEndsAt: org.foundingEndsAt };
  }
  let paying = 0;
  try {
    paying = await countPayingOrgs();
  } catch {
    paying = 0;
  }
  const schedule = signupScheduleFromPayingCount(paying);
  const foundingEndsAt = schedule === "founding" ? foundingEndsAtFrom() : null;
  const { error } = await billingDb(client)
    .from("organizations")
    .update({
      pricing_schedule: schedule,
      ...(foundingEndsAt ? { founding_ends_at: foundingEndsAt } : {}),
    })
    .eq("id", org.id);
  if (error && !/pricing_schedule|founding_ends_at|row-level security|42501/i.test(error.message ?? "")) {
    throw new Error(error.message);
  }
  return { schedule, foundingEndsAt };
}

async function ensurePausedSubscription(
  orgId: string,
  quote: HiveQuote,
  client: unknown,
) {
  const db = billingDb(client);
  const nowIso = new Date().toISOString();
  const { data: existing } = await db
    .from("org_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("organization_id", orgId)
    .maybeSingle();

  const patch = {
    plan: "hive_standard" as const,
    status: "paused" as const,
    mrr_cents: quote.monthlyCents,
    billing_interval: quote.interval,
    staff_count: quote.staffCount,
    locked_at: nowIso,
    lock_reason: UNPAID_LOCK_REASON,
  };

  if (existing) {
    if (existing.stripe_subscription_id && existing.status === "active") return existing;
    const { error } = await db.from("org_subscriptions").update(patch).eq("id", existing.id);
    if (error) {
      console.warn("[checkout] could not pause subscription row", { code: "sub_update" });
    }
    return existing;
  }
  const { data, error } = await db
    .from("org_subscriptions")
    .insert({
      organization_id: orgId,
      ...patch,
    })
    .select("id")
    .single();
  if (error) {
    // RLS often blocks org_subscriptions writes without a service-role client.
    // Checkout can still open; webhook/confirm writes the paid row later.
    console.warn("[checkout] could not insert paused subscription row", { code: "sub_insert" });
    return null;
  }
  return data;
}

async function activateExemptOrg(
  orgId: string,
  plan: "hive_standard" | "enterprise" = "hive_standard",
  client: unknown,
) {
  const db = billingDb(client);
  const nowIso = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const { data: existing } = await db
    .from("org_subscriptions")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();
  const patch = {
    plan,
    status: "active" as const,
    mrr_cents: 0,
    billing_interval: "monthly",
    locked_at: null,
    lock_reason: null,
    past_due_since: null,
    current_period_start: nowIso,
    current_period_end: periodEnd,
    renewal_date: periodEnd.slice(0, 10),
    started_at: nowIso,
  };
  if (existing) {
    const { error } = await db.from("org_subscriptions").update(patch).eq("id", existing.id);
    if (error) console.warn("[checkout] could not activate exempt row", { code: "exempt_update" });
  } else {
    const { error } = await db.from("org_subscriptions").insert({ organization_id: orgId, ...patch });
    if (error) console.warn("[checkout] could not insert exempt row", { code: "exempt_insert" });
  }
}

/** Public — signup payment step needs to know TEST MODE vs live-blocked before Checkout. */
export const getSignupPaymentsStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  const env = readStripeEnv();
  const cfg = stripePaymentsConfigured(env);
  const liveBlocked = isStripeLiveSecretKey(env.secretKey);
  return {
    paymentsConfigured: cfg.ok,
    testMode: cfg.testMode,
    liveBlocked,
    message: cfg.message,
  };
});

export const getBillingStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { organizationId?: string | null }) => {
    const organizationId = String(input?.organizationId ?? "");
    return { organizationId: UUID_RE.test(organizationId) ? organizationId : "" };
  })
  .handler(async ({ data, context }) => {
    const cfg = stripePaymentsConfigured();
    const env = readStripeEnv();
    const empty = {
      organizationId: null as string | null,
      billingExempt: false,
      accessLocked: false,
      testMode: cfg.testMode,
      paymentsConfigured: cfg.ok,
      paymentsMessage: cfg.message,
      plan: null as string | null,
      status: null as string | null,
      mrrCents: 0,
      lockedAt: null as string | null,
      lockReason: null as string | null,
      currentPeriodEnd: null as string | null,
      hasStripeCustomer: false,
      orgName: null as string | null,
      pricingSchedule: "list" as PricingSchedule,
      foundingEndsAt: null as string | null,
      staffCount: 1,
      clientCount: 0,
      interval: "monthly" as BillingInterval,
      perStaffCents: 0,
      monthlyCents: 0,
      billedCents: 0,
      minimumApplied: false,
      minimumCents: 0,
      quoteLabel: "List · $69 per client / month ($350 minimum)",
      foundingSlotsRemaining: 0,
      payingOrgCount: 0,
    };
    if (!context.supabase || !context.userId) return empty;

    const { data: memberships } = await context.supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", context.userId)
      .eq("active", true);
    const ms = memberships ?? [];
    if (ms.length === 0) return empty;

    const orgId =
      (data.organizationId && ms.some((m) => m.organization_id === data.organizationId)
        ? data.organizationId
        : null) ?? ms[0].organization_id;

    const org = await loadOrgRow(orgId, context.supabase);
    const exempt = orgIsComped(org);
    const { data: sub } = await billingDb(context.supabase)
      .from("org_subscriptions")
      .select(
        "plan, status, mrr_cents, locked_at, lock_reason, current_period_end, stripe_customer_id, stripe_subscription_id, staff_count, billing_interval",
      )
      .eq("organization_id", orgId)
      .maybeSingle();

    const accessLocked = orgAccessIsLocked({
      billingExempt: exempt,
      orgName: org.name,
      legalName: org.legalName,
      dbaName: org.dbaName,
      subscription: sub
        ? {
            status: (sub.status as string | null) ?? null,
            locked_at: (sub.locked_at as string | null) ?? null,
            stripe_subscription_id:
              (sub as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null,
          }
        : null,
    });

    const usage = await liveUsageCounts(orgId, context.supabase);
    const staffCount = clampStaffCount(
      (sub as { staff_count?: number | null } | null)?.staff_count || usage.staff || 1,
    );
    const clientCount = clampClientCount(usage.clients);
    const quote = quotePiListSubscription({ clientCount, interval: "monthly" });
    let payingOrgCount = 0;
    try {
      payingOrgCount = await countPayingOrgs();
    } catch {
      payingOrgCount = 0;
    }

    return {
      organizationId: orgId,
      billingExempt: exempt,
      accessLocked,
      testMode: cfg.testMode || (env.publishableKey ?? "").startsWith("pk_test_"),
      paymentsConfigured: cfg.ok,
      paymentsMessage: cfg.message,
      plan: (sub?.plan as string | null) ?? null,
      status: (sub?.status as string | null) ?? null,
      mrrCents: exempt ? 0 : quote.monthlyCents,
      lockedAt: (sub?.locked_at as string | null) ?? null,
      lockReason: (sub?.lock_reason as string | null) ?? null,
      currentPeriodEnd: (sub?.current_period_end as string | null) ?? null,
      hasStripeCustomer: !!(sub as { stripe_customer_id?: string | null } | null)?.stripe_customer_id,
      orgName: org.name,
      pricingSchedule: "list" as PricingSchedule,
      foundingEndsAt: org.foundingEndsAt,
      staffCount,
      clientCount: quote.clientCount,
      interval: "monthly" as BillingInterval,
      perStaffCents: quote.perClientCents,
      monthlyCents: quote.monthlyCents,
      billedCents: quote.billedCents,
      minimumApplied: quote.minimumApplied,
      minimumCents: quote.minimumCents,
      quoteLabel: quote.label,
      foundingSlotsRemaining: Math.max(0, FOUNDING_ORG_CAP - payingOrgCount),
      payingOrgCount,
    };
  });

export const createSubscriptionCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    organizationId: string;
    staffCount?: number;
    clientCount?: number;
    interval?: BillingInterval;
    pricingModel?: "pi_list" | "hive_staff";
    trainingAddon?: SignupTrainingAddonId | "none" | null;
    trainingPeople?: Array<{ name?: string | null; sku?: string | null }> | null;
    fromSignup?: boolean;
  }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization.");
    const trainingRaw = String(input?.trainingAddon ?? "none");
    const trainingPeople = trainingPeopleForCheckout(
      (Array.isArray(input?.trainingPeople) ? input.trainingPeople : []).map((row) => ({
        name: row?.name,
        sku: String(row?.sku ?? ""),
      })),
    );
    return {
      organizationId,
      staffCount: input?.staffCount != null ? clampStaffCount(input.staffCount) : undefined,
      clientCount: input?.clientCount != null ? clampClientCount(input.clientCount) : undefined,
      interval: input?.interval === "annual" ? ("annual" as const) : ("monthly" as const),
      pricingModel: resolveAgencyCheckoutPricingModel(input?.pricingModel),
      trainingAddon: isSignupTrainingAddonId(trainingRaw) ? trainingRaw : ("none" as const),
      trainingPeople,
      fromSignup: input?.fromSignup === true,
    };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      return { url: null as string | null, exempt: false, error: "Not signed in." };
    }
    const db = billingDb(context.supabase);
    try {
    await requireOrgAdmin(db, context.userId, data.organizationId);

    const org = await loadOrgRow(data.organizationId, db);
    if (orgIsComped(org)) {
      await activateExemptOrg(data.organizationId, "enterprise", db);
      return { url: null, exempt: true, error: null as string | null };
    }

    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) {
      return { url: null, exempt: false, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };
    }

    const usage = await liveUsageCounts(data.organizationId, db);
    const { data: existingSub } = await db
      .from("org_subscriptions")
      .select("staff_count, billing_interval")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const staffCount = clampStaffCount(
      data.staffCount ?? (existingSub as { staff_count?: number | null } | null)?.staff_count ?? usage.staff ?? 1,
    );
    const clientCount = clampClientCount(
      usage.clients > 0 ? usage.clients : (data.clientCount ?? org.approxClientCount ?? 0),
    );
    const interval: BillingInterval = data.interval;
    const usePiList = data.pricingModel === "pi_list";
    const rosterQuantities = trainingQuantitiesFromPeople(data.trainingPeople);
    const rosterLines = quoteSignupTrainingLines(rosterQuantities);
    const training = quoteSignupTrainingAddon(data.trainingAddon);
    const trainingForLines = rosterLines.length > 0 ? rosterLines : training;
    const trainingCents = rosterLines.length > 0
      ? rosterLines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)
      : training.priceCents;
    const trainingAddonLabel = rosterLines.length > 0
      ? rosterLines.map((line) => `${line.id}x${line.quantity}`).join(",")
      : training.id;

    let monthlyCents: number;
    let billedCents: number;
    let scheduleLabel: string;
    let built: { lineItems: ReturnType<typeof subscriptionLineItemsForPiListQuote>["lineItems"]; discounts?: Array<{ coupon: string }> };

    if (usePiList) {
      const quote = quotePiListSubscription({ clientCount, interval: "monthly" });
      monthlyCents = quote.monthlyCents;
      billedCents = quote.billedCents;
      scheduleLabel = "list";
      built = subscriptionLineItemsForPiListQuote(quote, trainingForLines);
      const { error: scheduleErr } = await db
        .from("organizations")
        .update({
          approx_client_count: clientCount,
          pricing_schedule: "list",
        })
        .eq("id", data.organizationId);
      if (
        scheduleErr &&
        !/pricing_schedule|approx_client_count|row-level security|42501/i.test(scheduleErr.message ?? "")
      ) {
        throw new Error(scheduleErr.message);
      }
      await ensurePausedSubscription(
        data.organizationId,
        {
          ...quoteHiveSubscription({
            staffCount,
            clientCount,
            schedule: "list",
            interval: "monthly",
          }),
          monthlyCents: quote.monthlyCents,
          billedCents: quote.billedCents,
          clientCount: quote.clientCount,
          interval: "monthly",
          schedule: "list",
        },
        db,
      );
    } else {
      const assigned = await resolveOrgSchedule(org, db);
      const quote = quoteHiveSubscription({
        staffCount,
        clientCount,
        schedule: assigned.schedule,
        interval,
        foundingEndsAt: assigned.foundingEndsAt,
      });
      monthlyCents = quote.monthlyCents;
      billedCents = quote.billedCents;
      scheduleLabel = quote.schedule;
      built = subscriptionLineItemsForQuote(quote);
      await db
        .from("organizations")
        .update({ approx_client_count: clientCount })
        .eq("id", data.organizationId);
      await ensurePausedSubscription(data.organizationId, quote, db);
    }

    const { data: sub } = await db
      .from("org_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const stripe = getStripe();
    let customerId = (sub as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organization_id: data.organizationId },
      });
      customerId = customer.id;
      const { error: custErr } = await db
        .from("org_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("organization_id", data.organizationId);
      if (custErr) {
        console.warn("[checkout] could not save Stripe customer id", { code: "cust_update" });
      }
    }

    const origin = appOriginFromRequest(getRequest());
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: data.organizationId,
      success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: data.fromSignup
        ? `${origin}/signup?checkout=cancelled`
        : `${origin}/billing-locked?checkout=cancelled`,
      line_items: built.lineItems,
      ...(built.discounts ? { discounts: built.discounts } : {}),
      metadata: {
        hive_kind: "subscription",
        organization_id: data.organizationId,
        plan: "hive_standard",
        pricing_model: usePiList ? "pi_list" : "hive_staff",
        pricing_schedule: scheduleLabel,
        staff_count: String(staffCount),
        client_count: String(clientCount),
        interval: usePiList ? "monthly" : interval,
        monthly_cents: String(monthlyCents),
        billed_cents: String(billedCents),
        training_addon: trainingAddonLabel.slice(0, 500),
        training_cents: String(trainingCents),
        training_cpr_qty: String(rosterQuantities.cpr_first_aid),
        training_thirty_day_qty: String(rosterQuantities.thirty_day),
        training_mandt_qty: String(rosterQuantities.mandt),
        training_pack_qty: String(rosterQuantities.pack),
        training_cpr_names: data.trainingPeople
          .filter((p) => p.sku === "cpr_first_aid")
          .map((p) => p.name)
          .filter(Boolean)
          .join(", ")
          .slice(0, 500),
        training_thirty_day_names: data.trainingPeople
          .filter((p) => p.sku === "thirty_day")
          .map((p) => p.name)
          .filter(Boolean)
          .join(", ")
          .slice(0, 500),
        training_mandt_names: data.trainingPeople
          .filter((p) => p.sku === "mandt")
          .map((p) => p.name)
          .filter(Boolean)
          .join(", ")
          .slice(0, 500),
        training_pack_names: data.trainingPeople
          .filter((p) => p.sku === "pack")
          .map((p) => p.name)
          .filter(Boolean)
          .join(", ")
          .slice(0, 500),
        purchaser_user_id: context.userId,
      },
      subscription_data: {
        metadata: {
          hive_kind: "subscription",
          organization_id: data.organizationId,
          plan: "hive_standard",
          pricing_model: usePiList ? "pi_list" : "hive_staff",
          pricing_schedule: scheduleLabel,
          staff_count: String(staffCount),
          client_count: String(clientCount),
          interval: usePiList ? "monthly" : interval,
        },
      },
    });

    return { url: session.url, exempt: false, error: null as string | null };
    } catch (e) {
      const { humanizeCheckoutStartError } = await import("@/lib/signup-checkout-error");
      return {
        url: null as string | null,
        exempt: false,
        error: humanizeCheckoutStartError(e),
      };
    }
  });

export const createPortalSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization.");
    return { organizationId };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      return { url: null as string | null, error: "Not signed in." };
    }
    await requireOrgAdmin(context.supabase, context.userId, data.organizationId);

    const org = await loadOrgRow(data.organizationId, context.supabase);
    if (orgIsComped(org)) {
      return { url: null, error: "This company is comped — no Stripe customer to manage." };
    }

    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) return { url: null, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };

    const { data: sub } = await billingDb(context.supabase)
      .from("org_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const customerId = (sub as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
    if (!customerId) {
      return { url: null, error: "No Stripe customer yet. Pay for a plan first." };
    }

    const origin = appOriginFromRequest(getRequest());
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard/billing/subscription`,
    });
    return { url: portal.url, error: null as string | null };
  });

export const confirmCheckoutSessionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sessionId: string }) => {
    const sessionId = String(input?.sessionId ?? "").trim();
    if (!sessionId.startsWith("cs_")) throw new Error("Invalid checkout session.");
    return { sessionId };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      return { ok: false, error: "Not signed in.", organizationId: null as string | null };
    }
    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) {
      return { ok: false, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED, organizationId: null };
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
      expand: ["subscription"],
    });
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return { ok: false, error: "Payment is not complete yet.", organizationId: null };
    }
    const orgId =
      session.metadata?.organization_id ||
      (typeof session.client_reference_id === "string" && UUID_RE.test(session.client_reference_id)
        ? session.client_reference_id
        : "");
    if (!orgId) {
      return { ok: false, error: "Checkout session is missing the company id.", organizationId: null };
    }
    await requireOrgAdmin(context.supabase, context.userId, orgId);

    const hiveKind = session.metadata?.hive_kind ?? "subscription";
    if (hiveKind === "training_class") {
      if (session.metadata?.class_id) {
        await fulfillTrainingClass({
          classId: session.metadata.class_id,
          organizationId: orgId,
          stripeSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
          amountCents: session.amount_total ?? 0,
        });
      }
      return { ok: true, error: null as string | null, organizationId: orgId };
    }
    if (hiveKind === "training") {
      if (session.metadata?.hive_order_id && session.metadata?.catalog_id) {
        await fulfillTrainingOrder({
          orderId: session.metadata.hive_order_id,
          catalogId: session.metadata.catalog_id,
          organizationId: orgId,
          modeContext: session.metadata.mode_context === "individual" ? "individual" : "bulk_seats",
          quantity: Number(session.metadata.quantity ?? "1") || 1,
          assigneeUserId: session.metadata.assignee_user_id || null,
          stripeSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
          amountCents: session.amount_total ?? 0,
        });
      }
      return { ok: true, error: null as string | null, organizationId: orgId };
    }

    const subscriptionRef = session.subscription;
    const subscriptionId =
      typeof subscriptionRef === "string"
        ? subscriptionRef
        : subscriptionRef && typeof subscriptionRef === "object" && "id" in subscriptionRef
          ? String((subscriptionRef as { id?: string }).id ?? "") || null
          : null;
    const periodEndUnix =
      subscriptionRef && typeof subscriptionRef === "object" && "current_period_end" in subscriptionRef
        ? Number((subscriptionRef as { current_period_end?: number }).current_period_end)
        : NaN;

    try {
      const wrote = await activateSubscriptionFromCheckout(
        {
          orgId,
          plan: session.metadata?.plan || "hive_standard",
          customerId: typeof session.customer === "string" ? session.customer : null,
          subscriptionId,
          paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          amountCents: session.amount_total ?? Number(session.metadata?.monthly_cents ?? 0),
          periodEndIso: Number.isFinite(periodEndUnix) && periodEndUnix > 0
            ? new Date(periodEndUnix * 1000).toISOString()
            : null,
          eventId: `checkout_confirm:${session.id}`,
          staffCount: Number(session.metadata?.staff_count ?? 0) || null,
          billingInterval: session.metadata?.interval === "annual" ? "annual" : "monthly",
          monthlyCents: Number(session.metadata?.monthly_cents ?? 0) || null,
        },
        context.supabase,
      );
      return {
        ok: true,
        error: null,
        organizationId: orgId,
        status: wrote ? "active" : "exempt",
      };
    } catch (e) {
      const { humanizeCheckoutConfirmError } = await import("@/lib/signup-checkout-error");
      return { ok: false, error: humanizeCheckoutConfirmError(e), organizationId: orgId, status: null };
    }
  });

type TrainingCheckoutInput = {
  organizationId: string;
  catalogId: string;
  modeContext: "bulk_seats" | "individual";
  quantity?: number;
  assigneeUserId?: string | null;
  renewalIntents?: Array<{ user_id: string; course_id: string }>;
};

export const createTrainingCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TrainingCheckoutInput) => {
    const organizationId = String(input?.organizationId ?? "");
    const catalogId = String(input?.catalogId ?? "");
    if (!UUID_RE.test(organizationId) || !UUID_RE.test(catalogId)) {
      throw new Error("Invalid training purchase.");
    }
    const modeContext = input?.modeContext === "individual" ? "individual" : "bulk_seats";
    const quantity = Math.max(1, Math.min(500, Math.floor(Number(input?.quantity ?? 1) || 1)));
    const assigneeUserId =
      typeof input?.assigneeUserId === "string" && UUID_RE.test(input.assigneeUserId)
        ? input.assigneeUserId
        : null;
    const renewalIntents = Array.isArray(input?.renewalIntents)
      ? input.renewalIntents.filter((i) => i && UUID_RE.test(i.user_id) && UUID_RE.test(i.course_id)).slice(0, 500)
      : [];
    return { organizationId, catalogId, modeContext, quantity, assigneeUserId, renewalIntents };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      return { url: null as string | null, granted: false, error: "Not signed in." };
    }
    await requireOrgAdmin(context.supabase, context.userId, data.organizationId);

    const org = await loadOrgRow(data.organizationId, context.supabase);
    const exempt = orgIsComped(org);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: sku, error: skuErr } = await admin
      .from("hive_training_catalog")
      .select("id, sku, name, price_cents, currency, active, kind, stripe_price_id")
      .eq("id", data.catalogId)
      .eq("active", true)
      .maybeSingle();
    if (skuErr || !sku) return { url: null, granted: false, error: "That training is not available." };

    const { data: sub } = await supabaseAdmin
      .from("org_subscriptions")
      .select("plan")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    const ents = entitlementsForOrg({
      billingExempt: exempt,
      plan: (sub?.plan as string | null) ?? null,
    });
    const env = readStripeEnv();
    const unitCents = stripeUnitAmountForTrainingSku(sku.sku, sku.price_cents);
    const extraPriceId = stripePriceIdForTrainingSku(sku.sku, sku.stripe_price_id, env);

    const needsCharge = trainingRequiresCharge({
      billingExempt: exempt,
      hasHiveTrainingAddon: ents.addons.includes("hive_training"),
      catalogKind: sku.kind,
      priceCents: unitCents,
    });

    const { data: order, error: orderErr } = await admin
      .from("hive_training_orders")
      .insert({
        organization_id: data.organizationId,
        purchaser_user_id: context.userId,
        model: data.modeContext,
        amount_cents: needsCharge ? unitCents * data.quantity : 0,
        currency: sku.currency ?? "usd",
        status: needsCharge ? "pending" : "paid",
      })
      .select("id")
      .single();
    if (orderErr || !order) {
      return { url: null, granted: false, error: orderErr?.message ?? "Could not start the order." };
    }

    await admin.from("hive_training_order_items").insert({
      order_id: order.id,
      catalog_id: sku.id,
      quantity: data.quantity,
      unit_price_cents: needsCharge ? unitCents : 0,
    });

    if (!needsCharge) {
      await fulfillTrainingOrder({
        orderId: order.id,
        catalogId: sku.id,
        organizationId: data.organizationId,
        modeContext: data.modeContext,
        quantity: data.quantity,
        assigneeUserId: data.assigneeUserId,
        amountCents: 0,
      });
      return { url: null, granted: true, error: null as string | null };
    }

    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) {
      return { url: null, granted: false, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };
    }

    const stripe = getStripe();
    const origin = appOriginFromRequest(getRequest());
    const priceId = extraPriceId;

    const lineItems = priceId
      ? [{ price: priceId, quantity: data.quantity }]
      : [
          {
            quantity: data.quantity,
            price_data: {
              currency: sku.currency ?? "usd",
              unit_amount: unitCents,
              product_data: { name: sku.name, metadata: { sku: sku.sku } },
            },
          },
        ];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      client_reference_id: order.id,
      success_url: `${origin}/dashboard/hive-training?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/hive-training?checkout=cancelled`,
      metadata: {
        hive_kind: "training",
        hive_order_id: order.id,
        mode_context: data.modeContext,
        catalog_id: sku.id,
        catalog_sku: sku.sku,
        quantity: String(data.quantity),
        organization_id: data.organizationId,
        purchaser_user_id: context.userId,
        assignee_user_id: data.assigneeUserId ?? "",
      },
    });

    await admin
      .from("hive_training_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    if (data.modeContext === "bulk_seats" && data.renewalIntents.length > 0) {
      const intentRows = data.renewalIntents.slice(0, data.quantity).map((i) => ({
        organization_id: data.organizationId,
        stripe_session_id: session.id,
        catalog_id: sku.id,
        user_id: i.user_id,
        course_id: i.course_id,
      }));
      if (intentRows.length > 0) {
        await admin.from("hive_training_renewal_intents").insert(intentRows);
      }
    }

    return { url: session.url, granted: false, error: null as string | null };
  });

type ClassRosterCheckoutInput = {
  organizationId: string;
  trainingType: TrainingClassType;
  roster: TrainingClassRosterRow[];
};

export const createTrainingClassCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ClassRosterCheckoutInput) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization.");
    const trainingType = String(input?.trainingType ?? "");
    if (!isTrainingClassType(trainingType)) throw new Error("Choose CPR, Mandt, 30-day, or the package.");
    const roster = cleanRosterRows(Array.isArray(input?.roster) ? input.roster : []);
    const rosterError = validateRosterRows(roster);
    if (rosterError) throw new Error(rosterError);
    return { organizationId, trainingType, roster };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      return { url: null as string | null, granted: false, classId: null as string | null, error: "Not signed in." };
    }
    await requireOrgAdmin(context.supabase, context.userId, data.organizationId);

    const org = await loadOrgRow(data.organizationId, context.supabase);
    const exempt = orgIsComped(org);
    const quote = quoteTrainingClass(data.trainingType, data.roster.length, exempt);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;

    const { data: cls, error: clsErr } = await admin
      .from("training_classes")
      .insert({
        organization_id: data.organizationId,
        training_type: data.trainingType,
        is_external: trainingClassIsExternal(data.trainingType),
        status: "upcoming",
        payment_status: exempt ? "waived" : "pending",
        seat_count: quote.seatCount,
        unit_price_cents: quote.unitCents,
        amount_cents: quote.totalCents,
        submitted_by: context.userId,
        provider_name: org.name,
      })
      .select("id")
      .single();
    if (clsErr || !cls) {
      return {
        url: null,
        granted: false,
        classId: null,
        error: clsErr?.message ?? "Could not save the class roster.",
      };
    }

    const rosterRows = data.roster.map((row, idx) => ({
      class_id: cls.id,
      organization_id: data.organizationId,
      staff_user_id: row.staffUserId && UUID_RE.test(row.staffUserId) ? row.staffUserId : null,
      staff_name: row.name,
      staff_email: row.email,
      staff_phone: row.phone,
      sort_order: idx,
    }));
    const { error: rosErr } = await admin.from("training_class_roster").insert(rosterRows);
    if (rosErr) {
      return { url: null, granted: false, classId: cls.id, error: rosErr.message };
    }

    if (exempt || quote.totalCents <= 0) {
      await fulfillTrainingClass({
        classId: cls.id,
        organizationId: data.organizationId,
        amountCents: 0,
        waived: true,
      });
      return { url: null, granted: true, classId: cls.id, error: null as string | null };
    }

    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) {
      return { url: null, granted: false, classId: cls.id, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };
    }

    const stripe = getStripe();
    const origin = appOriginFromRequest(getRequest());
    const label = trainingClassLabel(data.trainingType);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: quote.seatCount,
          price_data: {
            currency: "usd",
            unit_amount: quote.unitCents,
            product_data: {
              name: `${label} · ${quote.seatCount} seat${quote.seatCount === 1 ? "" : "s"}`,
              metadata: { training_type: data.trainingType, class_id: cls.id },
            },
          },
        },
      ],
      client_reference_id: cls.id,
      success_url: `${origin}/dashboard/hive-training?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/hive-training?checkout=cancelled`,
      metadata: {
        hive_kind: "training_class",
        class_id: cls.id,
        training_type: data.trainingType,
        quantity: String(quote.seatCount),
        organization_id: data.organizationId,
        purchaser_user_id: context.userId,
      },
    });

    await admin
      .from("training_classes")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", cls.id);

    return { url: session.url, granted: false, classId: cls.id, error: null as string | null };
  });
