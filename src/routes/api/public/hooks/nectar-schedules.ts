import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeNextRunAt } from "@/lib/saved-reports.functions";

export const Route = createFileRoute("/api/public/hooks/nectar-schedules")({
  server: {
    handlers: {
      POST: async () => {
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
          // Log a stub run (actual execution would re-invoke askNectarReport with the saved prompt)
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
