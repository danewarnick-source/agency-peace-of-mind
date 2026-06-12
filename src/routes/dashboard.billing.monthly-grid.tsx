import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/monthly-grid")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/financial/monthly-grid" });
  },
});
