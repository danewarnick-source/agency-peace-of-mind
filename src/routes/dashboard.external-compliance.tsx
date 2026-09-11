import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired standalone External compliance URL.
 * Knowledge base → External compliance is the product surface.
 */
export const Route = createFileRoute("/dashboard/external-compliance")({
  head: () => ({ meta: [{ title: "External compliance — Provider Interface" }] }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/hub/knowledge",
      search: { tab: "external" },
      replace: true,
    });
  },
});
