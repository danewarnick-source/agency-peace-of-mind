import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy org-wide Client file URL. Compliance → Client file is the product surface.
 */
export const Route = createFileRoute("/dashboard/client-file")({
  head: () => ({ meta: [{ title: "Client file — Provider Interface" }] }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/compliance",
      search: { tab: "client" },
      replace: true,
    });
  },
});
