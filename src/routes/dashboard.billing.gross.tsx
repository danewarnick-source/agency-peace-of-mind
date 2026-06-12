import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/gross")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/financial/gross" });
  },
});
