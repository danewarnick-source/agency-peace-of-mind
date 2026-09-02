import { createFileRoute } from "@tanstack/react-router";
import { HiveSubscriptionPanel } from "@/components/billing/hive-subscription-panel";

export const Route = createFileRoute("/dashboard/billing/subscription")({
  head: () => ({ meta: [{ title: "Subscription — Provider Interface" }] }),
  component: HiveSubscriptionPanel,
});
