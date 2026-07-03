import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  runDraftTick,
  verifyDraftTickSignature,
} from "@/lib/nectar-draft-tick.server";

// HMAC-signed public endpoint. The client driver, the startRequirementsDraft
// server fn, and the tab-close visibilitychange handler all POST here to
// nudge a NECTAR draft job forward. The endpoint itself does the AI work
// (bounded by a wall-clock budget) so progress advances even when the
// browser tab is not in the foreground.
const Body = z.object({ jobId: z.string().uuid() });

export const Route = createFileRoute("/api/public/hooks/nectar-draft-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-nectar-draft-signature");
        if (!verifyDraftTickSignature(raw, signature)) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(JSON.parse(raw));
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "Bad request" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const result = await runDraftTick(parsed.jobId);
          return new Response(
            JSON.stringify({ ok: true, ...result }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: (err as Error).message.slice(0, 300),
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
