import { createFileRoute } from "@tanstack/react-router";
import { AuthoritativeSourcesPage } from "@/components/pages/authoritative-sources-page";

export const Route = createFileRoute("/dashboard/authoritative-sources")({
  head: () => ({
    meta: [
      { title: "Authoritative Sources — HIVE" },
      {
        name: "description",
        content:
          "Upload your State SOW, contracts, and DSPD/DHS requirement documents. NECTAR reads from these as the source of truth.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  component: AuthoritativeSourcesPage,
});
