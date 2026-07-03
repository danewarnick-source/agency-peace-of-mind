import { createFileRoute } from "@tanstack/react-router";
import { NectarDocsPage } from "@/components/pages/nectar-docs-page";
import { FeatureGate } from "@/components/upgrade-gate";

export const Route = createFileRoute("/dashboard/nectar-docs")({
  head: () => ({
    meta: [
      { title: "Company Docs — HIVE" },
      {
        name: "description",
        content:
          "Client and staff document uploads — PCSPs, 1056 budgets, intake/referrals, assessments, certifications, training records. NECTAR parses every file on upload.",
      },
    ],
  }),
  component: () => (
    <FeatureGate featureKey="nectar">
      <NectarDocsPage />
    </FeatureGate>
  ),
});
