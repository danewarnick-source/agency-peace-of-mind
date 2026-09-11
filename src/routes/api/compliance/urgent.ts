/**
 * GET /api/compliance/urgent
 *
 * Tony's iPhone pass hit this path on CloudFront and sat ~15s on a 500.
 * Unauthenticated GET stays a fast no-PHI stub.
 *
 * Cron (POST or GET with x-cron-secret / Bearer) runs the Step 2
 * escalation evaluator for every active org. Idempotent: a second
 * nightly pass inserts zero new type=escalation rows while unresolved
 * keys still exist.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runNightlyEscalationEvaluator } from "@/lib/obligations/escalation";

async function runCron(): Promise<Response> {
  const result = await runNightlyEscalationEvaluator(supabaseAdmin);
  const status = result.errors.length ? 207 : 200;
  return Response.json(
    { ok: result.errors.length === 0, ...result },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/compliance/urgent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (verifyCronSecret(request)) {
          return runCron();
        }
        return Response.json(
          { ok: true, count: 0, items: [] },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        if (!verifyCronSecret(request)) {
          return Response.json(
            { error: "unauthorized" },
            { status: 401, headers: { "cache-control": "no-store" } },
          );
        }
        return runCron();
      },
    },
  },
});
