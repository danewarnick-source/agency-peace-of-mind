import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy org-wide Staff file URL. Compliance → Staff file is the product surface.
 */
export const Route = createFileRoute("/dashboard/personnel-file")({
  head: () => ({ meta: [{ title: "Staff file — Provider Interface" }] }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/compliance",
      search: { tab: "staff" },
      replace: true,
    });
  },
});
