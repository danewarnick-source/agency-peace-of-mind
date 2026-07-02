// HIVE Training — daily auto-renew job.
// For each org with auto-renew enabled, finds expiring assignments within
// lead_days, groups them into cheapest catalog purchases (bundling into the
// Full Program when it beats à-la-carte), charges the saved payment method
// off-session, and materializes seats + assignments on success.
// PHI-free: only reads/writes hive_training_* tables.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Settings = {
  organization_id: string;
  enabled: boolean;
  lead_days: number;
  scope: "all" | "full_program" | "selected";
  selected_catalog_ids: string[];
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
};

type Catalog = {
  id: string;
  sku: string;
  name: string;
  kind: string;
  price_cents: number;
  currency: string;
  active: boolean;
  fulfills_course_ids: string[] | null;
};

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return new Response("payments_not_configured", { status: 501 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Optional: run for a single org (manual trigger from UI).
  let onlyOrgId: string | null = null;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    onlyOrgId = body?.organization_id ?? null;
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const q = admin
    .from("hive_training_auto_renew_settings")
    .select("organization_id, enabled, lead_days, scope, selected_catalog_ids, stripe_customer_id, stripe_payment_method_id")
    .eq("enabled", true)
    .is("paused_reason", null);
  if (onlyOrgId) q.eq("organization_id", onlyOrgId);
  const { data: settingsRows, error: sErr } = await q;
  if (sErr) return new Response(`settings_read_failed: ${sErr.message}`, { status: 500 });

  const results: Record<string, unknown>[] = [];
  for (const settings of (settingsRows ?? []) as Settings[]) {
    try {
      const r = await processOrg(admin, stripe, settings);
      results.push({ organization_id: settings.organization_id, ...r });
    } catch (err) {
      const msg = (err as Error).message;
      await admin.from("hive_training_auto_renew_runs").insert({
        organization_id: settings.organization_id,
        status: "error",
        error_message: msg,
      });
      results.push({ organization_id: settings.organization_id, error: msg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

async function processOrg(
  admin: ReturnType<typeof createClient>,
  stripe: Stripe,
  settings: Settings,
) {
  const now = Date.now();
  const cutoff = new Date(now + settings.lead_days * 24 * 3600 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Load catalog + assignments in scope.
  const { data: catalogAll } = await admin
    .from("hive_training_catalog")
    .select("id, sku, name, kind, price_cents, currency, active, fulfills_course_ids")
    .eq("active", true);
  const catalog = (catalogAll ?? []) as Catalog[];
  if (catalog.length === 0) {
    await logRun(admin, settings.organization_id, "no_eligible", 0, 0, 0, null, "no active catalog");
    return { status: "no_eligible" };
  }

  const { data: assignments } = await admin
    .from("hive_training_assignments")
    .select("id, user_id, course_id, expires_at")
    .eq("organization_id", settings.organization_id)
    .not("expires_at", "is", null)
    .lte("expires_at", cutoff);

  // Filter down to those without an active future assignment already covering.
  const { data: allAssign } = await admin
    .from("hive_training_assignments")
    .select("user_id, course_id, expires_at, completed_at, status")
    .eq("organization_id", settings.organization_id);

  const expiringPairs: Array<{ user_id: string; course_id: string }> = [];
  for (const a of (assignments ?? []) as Array<{ user_id: string; course_id: string; expires_at: string }>) {
    // Skip if user already has a fresher assignment for this course.
    const fresher = (allAssign ?? []).some((x) => {
      const rx = x as { user_id: string; course_id: string; expires_at: string | null };
      if (rx.user_id !== a.user_id || rx.course_id !== a.course_id) return false;
      if (!rx.expires_at) return false;
      return new Date(rx.expires_at).getTime() > new Date(a.expires_at).getTime();
    });
    if (fresher) continue;
    expiringPairs.push({ user_id: a.user_id, course_id: a.course_id });
  }

  if (expiringPairs.length === 0) {
    await logRun(admin, settings.organization_id, "no_eligible", 0, 0, 0, null, "nothing expiring within lead window");
    return { status: "no_eligible" };
  }

  // Apply scope.
  const fullProgram = catalog.find((c) => c.kind === "full_program");
  const fpCourseIds = new Set<string>(((fullProgram?.fulfills_course_ids ?? []) as string[]));

  const scopeFilter = (pair: { course_id: string }, catalogId: string | null): boolean => {
    if (settings.scope === "all") return true;
    if (settings.scope === "full_program") return fpCourseIds.has(pair.course_id);
    if (settings.scope === "selected") {
      if (!catalogId) return false;
      return settings.selected_catalog_ids.includes(catalogId);
    }
    return true;
  };

  // Resolve à-la-carte catalog for each course_id.
  const catalogByCourse = new Map<string, Catalog>();
  for (const c of catalog) {
    if (c.kind === "full_program") continue;
    for (const cid of (c.fulfills_course_ids ?? []) as string[]) {
      if (!catalogByCourse.has(cid)) catalogByCourse.set(cid, c);
    }
  }

  // Group by user to decide bundling.
  const byUser = new Map<string, Set<string>>();
  for (const p of expiringPairs) {
    const cat = catalogByCourse.get(p.course_id);
    if (!scopeFilter(p, cat?.id ?? null)) continue;
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, new Set());
    byUser.get(p.user_id)!.add(p.course_id);
  }

  // Build purchase groups: catalog_id → intents[]
  type Intent = { user_id: string; course_id: string };
  const groups = new Map<string, { catalog: Catalog; intents: Intent[] }>();

  const pushIntent = (cat: Catalog, intent: Intent) => {
    if (!groups.has(cat.id)) groups.set(cat.id, { catalog: cat, intents: [] });
    groups.get(cat.id)!.intents.push(intent);
  };

  for (const [uid, courseSet] of byUser) {
    // Consider bundling if user needs all Full Program courses AND it's cheaper.
    const coversAllFp = fullProgram && fpCourseIds.size > 0 && Array.from(fpCourseIds).every((c) => courseSet.has(c));
    let useBundle = false;
    if (fullProgram && coversAllFp) {
      const aLaCarteTotal = Array.from(fpCourseIds).reduce((sum, cid) => sum + (catalogByCourse.get(cid)?.price_cents ?? 0), 0);
      if (aLaCarteTotal > fullProgram.price_cents) useBundle = true;
    }

    if (useBundle && fullProgram) {
      // One Full Program seat covers all FP courses for this user — emit one intent per FP course.
      for (const cid of fpCourseIds) {
        pushIntent(fullProgram, { user_id: uid, course_id: cid });
        courseSet.delete(cid);
      }
    }

    // Remaining courses purchased à-la-carte.
    for (const cid of courseSet) {
      const cat = catalogByCourse.get(cid);
      if (!cat) continue;
      pushIntent(cat, { user_id: uid, course_id: cid });
    }
  }

  if (groups.size === 0) {
    await logRun(admin, settings.organization_id, "no_eligible", 0, 0, 0, null, "no in-scope items");
    return { status: "no_eligible" };
  }

  // Payment method required to charge off-session.
  if (!settings.stripe_customer_id || !settings.stripe_payment_method_id) {
    await pauseSettings(admin, settings.organization_id, "no_payment_method");
    await logRun(admin, settings.organization_id, "card_failed", byUser.size, 0, 0, null, "no saved payment method");
    return { status: "card_failed", reason: "no_payment_method" };
  }

  // Compute total.
  let totalCents = 0;
  let totalSeats = 0;
  for (const g of groups.values()) {
    // One "seat" per intent. bulk_seats math: quantity = intents.length.
    totalCents += g.catalog.price_cents * g.intents.length;
    totalSeats += g.intents.length;
  }
  const currency = groups.values().next().value?.catalog.currency ?? "usd";

  // Charge once for the whole batch (single PaymentIntent).
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency,
      customer: settings.stripe_customer_id,
      payment_method: settings.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        hive_flow: "auto_renew",
        organization_id: settings.organization_id,
        seats: String(totalSeats),
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    await pauseSettings(admin, settings.organization_id, `charge_failed: ${msg}`);
    await logRun(admin, settings.organization_id, "card_failed", byUser.size, 0, totalCents, null, msg);
    return { status: "card_failed", reason: msg };
  }

  if (pi.status !== "succeeded") {
    await pauseSettings(admin, settings.organization_id, `charge_${pi.status}`);
    await logRun(admin, settings.organization_id, "card_failed", byUser.size, 0, totalCents, pi.id, `payment intent status ${pi.status}`);
    return { status: "card_failed", reason: pi.status };
  }

  // Materialize orders/seats/assignments per group.
  for (const g of groups.values()) {
    const { data: order } = await admin
      .from("hive_training_orders")
      .insert({
        organization_id: settings.organization_id,
        purchaser_user_id: null,
        model: "bulk_seats",
        amount_cents: g.catalog.price_cents * g.intents.length,
        currency: g.catalog.currency,
        status: "paid",
        paid_at: nowIso,
        stripe_payment_intent_id: pi.id,
        stripe_customer_id: settings.stripe_customer_id,
      })
      .select("id")
      .single();

    if (!order) continue;

    await admin.from("hive_training_order_items").insert({
      order_id: order.id,
      catalog_id: g.catalog.id,
      quantity: g.intents.length,
      unit_price_cents: g.catalog.price_cents,
    });

    // Seats (consumed) + assignments in a single pass.
    const seatRows = g.intents.map((i) => ({
      organization_id: settings.organization_id,
      order_id: order.id,
      catalog_id: g.catalog.id,
      status: "consumed",
      consumed_at: nowIso,
      assigned_to_user_id: i.user_id,
    }));
    const { data: seats } = await admin.from("hive_training_seats").insert(seatRows).select("id");

    const assignmentRows = g.intents.map((i, idx) => ({
      organization_id: settings.organization_id,
      user_id: i.user_id,
      course_id: i.course_id,
      payment_model: "bulk_seats",
      order_id: order.id,
      seat_id: seats?.[idx]?.id ?? null,
      status: "not_started",
    }));
    await admin.from("hive_training_assignments").insert(assignmentRows);

    // Audit trail as consumed renewal_intents (so the record ties back to renewals).
    const intentRows = g.intents.map((i) => ({
      organization_id: settings.organization_id,
      stripe_session_id: `auto_renew:${pi.id}`,
      catalog_id: g.catalog.id,
      user_id: i.user_id,
      course_id: i.course_id,
      consumed_at: nowIso,
    }));
    await admin.from("hive_training_renewal_intents").insert(intentRows);
  }

  await admin
    .from("hive_training_auto_renew_settings")
    .update({ last_run_at: nowIso, paused_reason: null })
    .eq("organization_id", settings.organization_id);

  await logRun(admin, settings.organization_id, "succeeded", byUser.size, totalSeats, totalCents, pi.id, null);
  return { status: "succeeded", seats: totalSeats, amount_cents: totalCents };
}

async function pauseSettings(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  reason: string,
) {
  await admin
    .from("hive_training_auto_renew_settings")
    .update({ paused_reason: reason, last_run_at: new Date().toISOString() })
    .eq("organization_id", orgId);
}

async function logRun(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  status: "succeeded" | "card_failed" | "no_eligible" | "partial" | "error",
  staffCount: number,
  seats: number,
  totalCents: number,
  piId: string | null,
  err: string | null,
) {
  await admin.from("hive_training_auto_renew_runs").insert({
    organization_id: orgId,
    status,
    staff_count: staffCount,
    seats_purchased: seats,
    total_amount_cents: totalCents,
    stripe_payment_intent_id: piId,
    error_message: err,
  });
}
