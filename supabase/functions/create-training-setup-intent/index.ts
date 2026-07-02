// HIVE Training — save a card for auto-renew.
// Opens a Stripe Checkout Session in `setup` mode. On success, the existing
// training-stripe-webhook records the resulting payment method on the org's
// hive_training_auto_renew_settings row.
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return json({ error: "payments_not_configured" }, 501);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1);
  const orgRow = memberships?.[0];
  if (!orgRow || !["admin", "manager", "super_admin"].includes(orgRow.role)) {
    return json({ error: "forbidden" }, 403);
  }

  // Ensure a Stripe customer exists for this org (reuse if already set).
  const { data: existing } = await admin
    .from("hive_training_auto_renew_settings")
    .select("stripe_customer_id")
    .eq("organization_id", orgRow.organization_id)
    .maybeSingle();

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { hive_organization_id: orgRow.organization_id },
    });
    customerId = customer.id;
    await admin
      .from("hive_training_auto_renew_settings")
      .upsert(
        { organization_id: orgRow.organization_id, stripe_customer_id: customerId },
        { onConflict: "organization_id" },
      );
  }

  const origin = req.headers.get("origin") ?? "https://agency-peace-of-mind.lovable.app";
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    success_url: `${origin}/dashboard/hive-training?card=saved&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/hive-training?card=cancelled`,
    metadata: {
      hive_flow: "auto_renew_setup",
      organization_id: orgRow.organization_id,
    },
  });

  return json({ url: session.url }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
