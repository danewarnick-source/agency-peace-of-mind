import { createFileRoute } from "@tanstack/react-router";
import { AuthoritativeSourcesPage } from "@/components/pages/authoritative-sources-page";
import { FeatureGate } from "@/components/upgrade-gate";

export const Route = createFileRoute("/dashboard/authoritative-sources")({
  head: () => ({
    meta: [
      { title: "Authoritative Sources — Provider Interface" },
      {
        name: "description",
        content:
          "Upload your State SOW, contracts, and DSPD/DHS requirement documents. NECTAR reads from these as the source of truth.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { focus?: string } =>
    typeof s.focus === "string" ? { focus: s.focus } : {},
  component: () => (
    <FeatureGate featureKey="nectar">
      <AuthoritativeSourcesPage />
    </FeatureGate>
  ),
});
