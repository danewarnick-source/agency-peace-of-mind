// HIVE Training — Stripe Checkout (test-mode, live-swappable).
// Two modes:
//   - bulk_seats:  company_admin buys N seats of a catalog SKU.
//   - individual:  staff pays for their own assignment of a specific course.
//
// Reads STRIPE_SECRET_KEY from Supabase secrets. If missing, returns 501 so the
// UI can surface a clear "payments not configured" state.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body =
  | { mode_context: "bulk_seats"; catalog_id: string; quantity: number; success_path?: string; cancel_path?: string }
  | { mode_context: "individual"; catalog_id: string; assignee_user_id: string; success_path?: string; cancel_path?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "payments_not_configured", detail: "STRIPE_SECRET_KEY is not set." }, 501);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Authenticated client (as the caller) to identify user + org membership.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const user = userData.user;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !("mode_context" in body) || !body.catalog_id) return json({ error: "bad_request" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Load catalog row (server-side price, never trust client).
  const { data: sku, error: skuErr } = await admin
    .from("hive_training_catalog")
    .select("id, sku, name, price_cents, currency, active, fulfills_course_ids, kind")
    .eq("id", body.catalog_id)
    .eq("active", true)
    .maybeSingle();
  if (skuErr || !sku) return json({ error: "catalog_not_found" }, 404);

  // Resolve caller's org (first active membership; admin flows only have one context).
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1);
  const orgRow = memberships?.[0];

  let quantity = 1;
  let assigneeUserId: string | null = null;

  if (body.mode_context === "bulk_seats") {
    if (!orgRow) return json({ error: "no_org" }, 400);
    quantity = Math.max(1, Math.min(500, Math.floor(body.quantity || 1)));
  } else if (body.mode_context === "individual") {
    // Individual: assignee must be self OR an org-member of the caller's org (if caller is admin).
    assigneeUserId = body.assignee_user_id || user.id;
    if (assigneeUserId !== user.id) {
      if (!orgRow || !["admin", "manager", "super_admin"].includes(orgRow.role)) {
        return json({ error: "forbidden_assignee" }, 403);
      }
    }
    quantity = 1;
  } else {
    return json({ error: "bad_mode_context" }, 400);
  }

  // Draft order (marked paid later by webhook).
  const { data: order, error: orderErr } = await admin
    .from("hive_training_orders")
    .insert({
      organization_id: orgRow?.organization_id ?? null,
      purchaser_user_id: user.id,
      model: body.mode_context,
      amount_cents: sku.price_cents * quantity,
      currency: sku.currency ?? "usd",
      status: "pending",
    })
    .select("id")
    .single();
  if (orderErr || !order) return json({ error: "order_create_failed", detail: orderErr?.message }, 500);

  await admin.from("hive_training_order_items").insert({
    order_id: order.id,
    catalog_id: sku.id,
    quantity,
    unit_price_cents: sku.price_cents,
  });

  // Stripe session using inline price_data (no pre-created Stripe prices required).
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const origin = req.headers.get("origin") ?? "https://agency-peace-of-mind.lovable.app";
  const successPath = body.success_path ?? "/dashboard/hive-training?checkout=success";
  const cancelPath = body.cancel_path ?? "/dashboard/hive-training?checkout=cancelled";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity,
        price_data: {
          currency: sku.currency ?? "usd",
          unit_amount: sku.price_cents,
          product_data: {
            name: sku.name,
            metadata: { sku: sku.sku },
          },
        },
      },
    ],
    client_reference_id: order.id,
    success_url: `${origin}${successPath}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${cancelPath}`,
    metadata: {
      hive_order_id: order.id,
      mode_context: body.mode_context,
      catalog_id: sku.id,
      catalog_sku: sku.sku,
      quantity: String(quantity),
      organization_id: orgRow?.organization_id ?? "",
      purchaser_user_id: user.id,
      assignee_user_id: assigneeUserId ?? "",
    },
  });

  await admin
    .from("hive_training_orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id);

  return json({ url: session.url, order_id: order.id, session_id: session.id }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
