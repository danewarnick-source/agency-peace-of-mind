import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/totals")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/financial/totals" });
  },
});
