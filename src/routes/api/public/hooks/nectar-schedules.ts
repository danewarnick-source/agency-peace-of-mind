import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeNextRunAt } from "@/lib/saved-reports.functions";

function verifyCronSecret(request: Request): boolean {
  const expected = process.env.NECTAR_CRON_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/hooks/nectar-schedules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyCronSecret(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const now = new Date();
        const { data: due, error } = await supabaseAdmin
          .from("nectar_report_schedules")
          .select("id, saved_report_id, cadence, day_of_week, day_of_month, hour, next_run_at")
          .eq("active", true)
          .lte("next_run_at", now.toISOString())
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }
        let processed = 0;
        for (const s of (due ?? []) as Array<{
          id: string; saved_report_id: string; cadence: "weekly" | "monthly";
          day_of_week: number | null; day_of_month: number | null; hour: number;
        }>) {
          await supabaseAdmin.from("nectar_report_runs").insert({
            saved_report_id: s.saved_report_id,
            ran_at: now.toISOString(),
            row_count: null,
            error: null,
          });
          const next = computeNextRunAt(s, now);
          await supabaseAdmin
            .from("nectar_report_schedules")
            .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString() })
            .eq("id", s.id);
          processed++;
        }
        return new Response(JSON.stringify({ ok: true, processed }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
