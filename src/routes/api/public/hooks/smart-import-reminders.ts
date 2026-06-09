import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Recurring sweep for Smart Import reminders. Advisory only — never blocks.
 *
 * Runs on a pg_cron schedule. For every org with open import jobs:
 *   - rebuild reminders for unresolved flags / provisional certs /
 *     unverified certs / expiring certs / unanswered NECTAR questions
 *   - escalate urgency when a deadline is within 14 days
 *
 * Authentication: bypassed under /api/public/* on published sites, but we
 * still require the Supabase anon `apikey` header as a soft gate so external
 * traffic with no header is rejected.
 */
export const Route = createFileRoute("/api/public/hooks/smart-import-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = Date.now();
        const dueAt = new Date(now).toISOString();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        // Process only reminders that are due for re-nag.
        const { data: due, error } = await supabaseAdmin
          .from("notifications")
          .select("id, type, related_id, related_type, urgency, organization_id")
          .in("type", [
            "smart_import_flag",
            "smart_import_provisional_cert",
            "smart_import_unverified_cert",
            "smart_import_cert_expiring",
            "smart_import_question",
          ])
          .is("resolved_at", null)
          .lte("next_remind_at", dueAt)
          .limit(500);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        let cleared = 0;
        let bumped = 0;

        for (const n of due ?? []) {
          // Check whether the underlying item is still unresolved.
          let stillOpen = true;
          let escalate = false;
          let nextIso = new Date(now + oneWeek).toISOString();

          if (n.related_type === "import_subject") {
            const { data: s } = await supabaseAdmin
              .from("import_subjects")
              .select("review_status, match_status, committed_at, review_decision")
              .eq("id", n.related_id ?? "")
              .maybeSingle();
            if (!s) { stillOpen = false; }
            else if (s.committed_at && s.review_status !== "needs_info" && s.review_status !== "flagged" && s.match_status !== "ambiguous") {
              stillOpen = false;
            }
          } else if (n.related_type === "import_cert_document") {
            const { data: c } = await supabaseAdmin
              .from("import_cert_documents")
              .select("state, expiry_date")
              .eq("id", n.related_id ?? "")
              .maybeSingle();
            if (!c) { stillOpen = false; }
            else if (n.type === "smart_import_cert_expiring") {
              if (!c.expiry_date) stillOpen = false;
              else {
                const days = Math.round((new Date(c.expiry_date).getTime() - now) / 86400000);
                if (days > 30) stillOpen = false;
                if (days <= 14) escalate = true;
              }
            } else {
              if (c.state === "verified") stillOpen = false;
            }
          } else if (n.related_type === "import_nectar_question") {
            const { data: q } = await supabaseAdmin
              .from("import_nectar_questions")
              .select("answered_at")
              .eq("id", n.related_id ?? "")
              .maybeSingle();
            if (!q || q.answered_at) stillOpen = false;
          }

          if (!stillOpen) {
            await supabaseAdmin
              .from("notifications")
              .update({ resolved_at: new Date().toISOString() })
              .eq("id", n.id);
            cleared++;
          } else {
            const patch: { next_remind_at: string; urgency?: string } = { next_remind_at: nextIso };
            if (escalate && n.urgency !== "critical") patch.urgency = "critical";
            await supabaseAdmin.from("notifications").update(patch).eq("id", n.id);
            bumped++;
          }
        }

        return new Response(JSON.stringify({ ok: true, processed: due?.length ?? 0, cleared, bumped }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
