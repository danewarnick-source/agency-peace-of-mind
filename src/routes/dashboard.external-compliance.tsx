import { createFileRoute } from "@tanstack/react-router";
import { ExternalCompliancePage } from "@/components/pages/external-compliance-page";
import { FeatureGate } from "@/components/upgrade-gate";

export const Route = createFileRoute("/dashboard/external-compliance")({
  head: () => ({ meta: [{ title: "External Compliance — HIVE" }] }),
  component: () => (
    <FeatureGate featureKey="nectar">
      <ExternalCompliancePage />
    </FeatureGate>
  ),
});
