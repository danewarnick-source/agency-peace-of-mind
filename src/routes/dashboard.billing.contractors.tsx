import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/contractors")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/financial/contractors" });
  },
});
