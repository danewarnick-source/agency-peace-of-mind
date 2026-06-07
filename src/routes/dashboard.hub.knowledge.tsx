import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HubShell } from "@/components/admin-hubs/hub-shell";
import { AuthoritativeSourcesPage } from "./dashboard.authoritative-sources";
import { NectarDocsPage } from "./dashboard.nectar-docs";
import { ExternalCompliancePage } from "./dashboard.external-compliance";

const search = z.object({ tab: z.enum(["sources", "docs", "external"]).optional() });

export const Route = createFileRoute("/dashboard/hub/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge base — HIVE" }] }),
  validateSearch: (s) => search.parse(s),
  component: () => (
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
  ),
});
