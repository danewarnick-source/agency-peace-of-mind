// Standalone CE Hours screen retired. CE now lives inside Records Desk →
// Training Records. This route redirects any existing deep links there.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/admin/ce-hours")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/records-desk",
      search: { tab: "training-records" },
    });
  },
  component: () => null,
});
