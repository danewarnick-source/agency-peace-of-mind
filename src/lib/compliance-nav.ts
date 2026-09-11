/**
 * Admin Compliance shell search — Staff file / Client file / Agency file.
 * Legacy query aliases stay accepted so old bookmarks keep working.
 */

export const COMPLIANCE_FILE_TABS = ["staff", "client", "agency"] as const;
export type ComplianceFileTab = (typeof COMPLIANCE_FILE_TABS)[number];
export type AgencyFileSubTab = "documents" | "company-policies";

export type ComplianceSearch = {
  tab?: string;
};

const STAFF_ALIASES = new Set(["staff", "personnel", "personnel-file", "staff-file"]);
const CLIENT_ALIASES = new Set(["client", "client-file"]);
const AGENCY_ALIASES = new Set(["agency", "agency-file", "agency-documents", "documents"]);
const POLICY_ALIASES = new Set(["company-policies", "policies", "policy-library"]);

export function parseComplianceSearch(s: Record<string, unknown>): ComplianceSearch {
  const tabRaw = typeof s.tab === "string" ? s.tab.trim() : "";
  if (!tabRaw) return {};
  return { tab: tabRaw };
}

export function resolveComplianceFileTab(tab?: string): ComplianceFileTab {
  const key = (tab ?? "").trim().toLowerCase();
  if (CLIENT_ALIASES.has(key)) return "client";
  if (AGENCY_ALIASES.has(key) || POLICY_ALIASES.has(key)) return "agency";
  return "staff";
}

export function resolveAgencyFileSubTab(tab?: string): AgencyFileSubTab {
  const key = (tab ?? "").trim().toLowerCase();
  if (POLICY_ALIASES.has(key)) return "company-policies";
  return "documents";
}

export function complianceSearchForFileTab(tab: ComplianceFileTab): ComplianceSearch {
  return { tab };
}

export function complianceSearchForAgencySubTab(sub: AgencyFileSubTab): ComplianceSearch {
  return { tab: sub === "company-policies" ? "company-policies" : "agency" };
}

export function complianceRedirectSearchFromAgencyDocuments(
  tab?: string,
): ComplianceSearch {
  return resolveAgencyFileSubTab(tab) === "company-policies"
    ? { tab: "company-policies" }
    : { tab: "agency" };
}
