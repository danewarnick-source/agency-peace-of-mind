// Daily billing cron — locks past-due accounts and emits card-expiry warnings.
//
// Both helpers are idempotent by design:
//   - checkAndLockPastDueAccounts only touches subs where locked_at IS NULL,
//     so a second run that day finds zero rows.
//   - checkCardExpiryWarnings de-dupes by checking payment_events for a
//     card_expiry_warning of the same tier within the last 7 days before
//     writing the event and sending the email.
//
// Endpoint is public (under /api/public/*). We additionally require the
// Supabase anon key in the `apikey` header so random callers can't trigger
// the job; pg_cron sends this header per the cron SQL below.
//
// -----------------------------------------------------------------------------
// Enable this cron by running the following in the SQL editor (NOT a migration —
// the URL/key are env-specific):
//
//   create extension if not exists pg_cron;
//   create extension if not exists pg_net;
//
//   select cron.schedule(
//     'billing-daily-check',
//     '15 9 * * *',  -- 09:15 UTC daily (~3:15 AM Mountain)
//     $$
//     select net.http_post(
//       url     := 'https://project--4bb83c55-d88b-48a7-ba9c-cfb9436a8b52.lovable.app/api/public/hooks/billing-daily-check',
//       headers := '{"Content-Type":"application/json","apikey":"<VITE_SUPABASE_PUBLISHABLE_KEY>"}'::jsonb,
//       body    := '{}'::jsonb
//     );
//     $$
//   );
//
//   -- inspect:        select * from cron.job;
//   -- run history:    select * from cron.job_run_details order by start_time desc limit 20;
//   -- unschedule:     select cron.unschedule('billing-daily-check');
// -----------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/billing-daily-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const startedAt = new Date().toISOString();
        const { checkAndLockPastDueAccounts, checkCardExpiryWarnings } = await import(
          "@/lib/billing-lockout.server"
        );

        const result: {
          started_at: string;
          finished_at?: string;
          lock?: { locked: number; org_ids: string[] };
          expiry?: { warned: number; org_ids: string[] };
          errors: string[];
        } = { started_at: startedAt, errors: [] };

        try {
          result.lock = await checkAndLockPastDueAccounts();
          console.log("[billing-daily-check] locked", result.lock);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[billing-daily-check] lock step failed", msg);
          result.errors.push(`lock: ${msg}`);
        }

        try {
          result.expiry = await checkCardExpiryWarnings();
          console.log("[billing-daily-check] expiry warnings", result.expiry);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[billing-daily-check] expiry step failed", msg);
          result.errors.push(`expiry: ${msg}`);
        }

        result.finished_at = new Date().toISOString();
        return new Response(JSON.stringify(result), {
          status: result.errors.length ? 207 : 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
