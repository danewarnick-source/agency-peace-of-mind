import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings/subscription")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/billing/subscription" });
  },
});
