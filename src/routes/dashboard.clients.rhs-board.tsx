import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * CRM Phase B3 — the standalone RHS planning board was consolidated into
 * the Clients → Whiteboard tab. This route now redirects for any old
 * bookmarks / links.
 */
export const Route = createFileRoute("/dashboard/clients/rhs-board")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/hub/clients",
      search: { tab: "whiteboard" as const },
    });
  },
});
