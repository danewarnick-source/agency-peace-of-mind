import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved: HIVE Subscription now lives under Settings.
export const Route = createFileRoute("/dashboard/billing/subscription")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/subscription" });
  },
});
