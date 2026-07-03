import { createFileRoute } from "@tanstack/react-router";
import { ExternalCompliancePage } from "@/components/pages/external-compliance-page";

export const Route = createFileRoute("/dashboard/external-compliance")({
  head: () => ({ meta: [{ title: "External Compliance — HIVE" }] }),
  component: ExternalCompliancePage,
});
