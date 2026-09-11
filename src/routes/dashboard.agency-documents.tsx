import { createFileRoute, redirect } from "@tanstack/react-router";
import { complianceRedirectSearchFromAgencyDocuments } from "@/lib/compliance-nav";

type AgencyDocumentsSearch = {
  tab?: "documents" | "company-policies";
};

function parseAgencyDocumentsSearch(s: Record<string, unknown>): AgencyDocumentsSearch {
  const tabRaw = typeof s.tab === "string" ? s.tab.trim() : "";
  if (tabRaw === "company-policies" || tabRaw === "policies" || tabRaw === "policy-library") {
    return { tab: "company-policies" };
  }
  return {};
}

/**
 * Legacy Agency file URL. Compliance → Agency file is the product surface.
 * Company policies stays a sub-tab (`?tab=company-policies`).
 */
export const Route = createFileRoute("/dashboard/agency-documents")({
  head: () => ({ meta: [{ title: "Agency file — Provider Interface" }] }),
  validateSearch: parseAgencyDocumentsSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/dashboard/compliance",
      search: complianceRedirectSearchFromAgencyDocuments(search.tab),
      replace: true,
    });
  },
});
