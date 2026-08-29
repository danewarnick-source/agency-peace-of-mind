/**
 * GET /api/compliance/urgent
 *
 * Tony's iPhone pass hit this path on CloudFront and sat ~15s on a 500.
 * There is no other caller in-repo; keep the route so the request returns
 * quickly and never dumps PHI. Action Required itself reads via
 * listCompanyObligations (now skipMutations) + client queries.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/compliance/urgent")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          { ok: true, count: 0, items: [] },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
