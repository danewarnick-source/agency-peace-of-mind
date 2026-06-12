import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/billing/host-home")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/financial/host-home" });
  },
});
