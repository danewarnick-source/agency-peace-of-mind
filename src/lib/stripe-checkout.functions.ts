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
  mrrCentsForPlan,
  readStripeEnv,
  stripePaymentsConfigured,
  stripePriceIdForPlan,
} from "@/lib/stripe-config";
import { appOriginFromRequest, getStripe } from "@/lib/stripe.server";
import { activateSubscriptionFromCheckout } from "@/lib/stripe-webhook";
import { fulfillTrainingOrder } from "@/lib/training-fulfillment.server";
import { isPublicSelfServeTier, type TierId } from "@/lib/hive-tiers";

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

async function loadOrgRow(orgId: string) {
  const full = await supabaseAdmin
    .from("organizations")
    .select("id, name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  if (!full.error && full.data) {
    const row = full.data as {
      id: string;
      name: string;
      legal_name: string | null;
      dba_name: string | null;
      billing_exempt?: boolean;
    };
    return {
      id: row.id,
      name: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      billingExempt: row.billing_exempt === true,
    };
  }
  const fallback = await supabaseAdmin
    .from("organizations")
    .select("id, name, legal_name, dba_name")
    .eq("id", orgId)
    .maybeSingle();
  if (fallback.error || !fallback.data) throw new Error("Organization not found.");
  const row = fallback.data as {
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
  };
}

function orgIsComped(org: Awaited<ReturnType<typeof loadOrgRow>>): boolean {
  return isBillingExempt({
    billingExempt: org.billingExempt,
    orgName: org.name,
    legalName: org.legalName,
    dbaName: org.dbaName,
  });
}

async function ensurePausedSubscription(orgId: string, plan: TierId) {
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("org_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("organization_id", orgId)
    .maybeSingle();

  const patch = {
    plan,
    status: "paused" as const,
    mrr_cents: mrrCentsForPlan(plan),
    billing_interval: "monthly",
    locked_at: nowIso,
    lock_reason: UNPAID_LOCK_REASON,
  };

  if (existing) {
    if (existing.stripe_subscription_id && existing.status === "active") return existing;
    await supabaseAdmin.from("org_subscriptions").update(patch).eq("id", existing.id);
    return existing;
  }
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .insert({
      organization_id: orgId,
      ...patch,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function activateExemptOrg(orgId: string, plan: TierId) {
  const nowIso = new Date().toISOString();
  const periodEnd = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const { data: existing } = await supabaseAdmin
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
    await supabaseAdmin.from("org_subscriptions").update(patch).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("org_subscriptions").insert({ organization_id: orgId, ...patch });
  }
}

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

    const org = await loadOrgRow(orgId);
    const exempt = orgIsComped(org);
    const { data: sub } = await supabaseAdmin
      .from("org_subscriptions")
      .select(
        "plan, status, mrr_cents, locked_at, lock_reason, current_period_end, stripe_customer_id, stripe_subscription_id",
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

    return {
      organizationId: orgId,
      billingExempt: exempt,
      accessLocked,
      testMode: cfg.testMode || (env.publishableKey ?? "").startsWith("pk_test_"),
      paymentsConfigured: cfg.ok,
      paymentsMessage: cfg.message,
      plan: (sub?.plan as string | null) ?? null,
      status: (sub?.status as string | null) ?? null,
      mrrCents: (sub?.mrr_cents as number | null) ?? 0,
      lockedAt: (sub?.locked_at as string | null) ?? null,
      lockReason: (sub?.lock_reason as string | null) ?? null,
      currentPeriodEnd: (sub?.current_period_end as string | null) ?? null,
      hasStripeCustomer: !!(sub as { stripe_customer_id?: string | null } | null)?.stripe_customer_id,
      orgName: org.name,
    };
  });

export const createSubscriptionCheckoutFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; plan: "pro" | "enterprise" }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization.");
    const plan = input?.plan;
    if (!isPublicSelfServeTier(plan)) throw new Error("Pick Pro or Enterprise.");
    return { organizationId, plan };
  })
  .handler(async ({ data, context }) => {
    if (!context.supabase || !context.userId) {
      return { url: null as string | null, exempt: false, error: "Not signed in." };
    }
    await requireOrgAdmin(context.supabase, context.userId, data.organizationId);

    const org = await loadOrgRow(data.organizationId);
    if (orgIsComped(org)) {
      await activateExemptOrg(data.organizationId, data.plan);
      return { url: null, exempt: true, error: null as string | null };
    }

    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) {
      return { url: null, exempt: false, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };
    }

    const priceId = stripePriceIdForPlan(data.plan);
    if (!priceId) {
      return {
        url: null,
        exempt: false,
        error: "Missing Stripe price for this plan. Add STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE.",
      };
    }

    await ensurePausedSubscription(data.organizationId, data.plan);

    const { data: sub } = await supabaseAdmin
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
      await supabaseAdmin
        .from("org_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("organization_id", data.organizationId);
    }

    const origin = appOriginFromRequest(getRequest());
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: data.organizationId,
      success_url: `${origin}/dashboard/billing/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing/subscription?checkout=cancelled`,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        hive_kind: "subscription",
        organization_id: data.organizationId,
        plan: data.plan,
        purchaser_user_id: context.userId,
      },
      subscription_data: {
        metadata: {
          hive_kind: "subscription",
          organization_id: data.organizationId,
          plan: data.plan,
        },
      },
    });

    return { url: session.url, exempt: false, error: null as string | null };
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

    const org = await loadOrgRow(data.organizationId);
    if (orgIsComped(org)) {
      return { url: null, error: "This company is comped — no Stripe customer to manage." };
    }

    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) return { url: null, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };

    const { data: sub } = await supabaseAdmin
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
    if (!context.supabase || !context.userId) return { ok: false, error: "Not signed in." };
    const cfg = stripePaymentsConfigured();
    if (!cfg.ok) return { ok: false, error: cfg.message ?? PAYMENTS_NOT_CONFIGURED };

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(data.sessionId);
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return { ok: false, error: "Payment is not complete yet." };
    }
    const orgId = session.metadata?.organization_id;
    if (!orgId) return { ok: false, error: "Checkout session is missing the company id." };
    await requireOrgAdmin(context.supabase, context.userId, orgId);

    const hiveKind = session.metadata?.hive_kind ?? "subscription";
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
      return { ok: true, error: null as string | null };
    }

    await activateSubscriptionFromCheckout({
      orgId,
      plan: session.metadata?.plan || "pro",
      customerId: typeof session.customer === "string" ? session.customer : null,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      amountCents: session.amount_total ?? mrrCentsForPlan(session.metadata?.plan || "pro"),
      periodEndIso: null,
      eventId: `checkout_confirm:${session.id}`,
    });
    return { ok: true, error: null };
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

    const org = await loadOrgRow(data.organizationId);
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
    const needsCharge = trainingRequiresCharge({
      billingExempt: exempt,
      hasHiveTrainingAddon: ents.addons.includes("hive_training"),
      catalogKind: sku.kind,
      priceCents: sku.price_cents,
    });

    const { data: order, error: orderErr } = await admin
      .from("hive_training_orders")
      .insert({
        organization_id: data.organizationId,
        purchaser_user_id: context.userId,
        model: data.modeContext,
        amount_cents: needsCharge ? sku.price_cents * data.quantity : 0,
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
      unit_price_cents: needsCharge ? sku.price_cents : 0,
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
    const env = readStripeEnv();
    const priceId =
      (typeof sku.stripe_price_id === "string" && sku.stripe_price_id.startsWith("price_")
        ? sku.stripe_price_id
        : null) ||
      (sku.kind === "full_program" ? env.priceTrainingFull : null);

    const lineItems = priceId
      ? [{ price: priceId, quantity: data.quantity }]
      : [
          {
            quantity: data.quantity,
            price_data: {
              currency: sku.currency ?? "usd",
              unit_amount: sku.price_cents,
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
