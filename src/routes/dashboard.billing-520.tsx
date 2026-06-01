import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing-520")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/billing/form520" });
  },
});
