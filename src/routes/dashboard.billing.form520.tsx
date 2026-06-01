import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/form520")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/billing-520" });
  },
});
