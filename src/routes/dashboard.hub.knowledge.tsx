import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell } from "@/components/admin-hubs/hub-shell";
import { AuthoritativeSourcesPage } from "@/components/pages/authoritative-sources-page";
import { NectarDocsPage } from "@/components/pages/nectar-docs-page";
import { ExternalCompliancePage } from "@/components/pages/external-compliance-page";
import { FeatureGate } from "@/components/upgrade-gate";

const search = z.object({ tab: z.enum(["sources", "docs", "external"]).optional() });

export const Route = createFileRoute("/dashboard/hub/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge base — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: () => (
    <FeatureGate featureKey="nectar">
      <HubShell
        title="Knowledge base"
        subtitle="NECTAR's grounding — sources, company docs, external compliance"
        basePath="/dashboard/hub/knowledge"
        tabs={[
          { key: "sources", label: "Authoritative sources", render: () => <AuthoritativeSourcesPage /> },
          { key: "docs", label: "Company docs", render: () => <NectarDocsPage /> },
          { key: "external", label: "External compliance", render: () => <ExternalCompliancePage /> },
        ]}
      />
    </FeatureGate>
  ),
});
