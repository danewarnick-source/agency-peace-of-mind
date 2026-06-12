import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/distributions")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/financial/distributions" });
  },
});
