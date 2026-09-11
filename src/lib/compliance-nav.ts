/**
 * Admin Compliance shell search — Staff file / Client file / Agency file.
 * Legacy query aliases stay accepted so old bookmarks keep working.
 */

export const COMPLIANCE_FILE_TABS = ["staff", "client", "agency"] as const;
export type ComplianceFileTab = (typeof COMPLIANCE_FILE_TABS)[number];
export type AgencyFileSubTab = "documents" | "company-policies" | "contract-index";

export type ComplianceSearch = {
  tab?: string;
};

const STAFF_ALIASES = new Set(["staff", "personnel", "personnel-file", "staff-file"]);
const CLIENT_ALIASES = new Set(["client", "client-file"]);
const AGENCY_ALIASES = new Set(["agency", "agency-file", "agency-documents", "documents"]);
const POLICY_ALIASES = new Set(["company-policies", "policies", "policy-library"]);
const CONTRACT_ALIASES = new Set(["contract-index", "sow-index", "agency-contract", "contract"]);

export function parseComplianceSearch(s: Record<string, unknown>): ComplianceSearch {
  const tabRaw = typeof s.tab === "string" ? s.tab.trim() : "";
  if (!tabRaw) return {};
  return { tab: tabRaw };
}

export function resolveComplianceFileTab(tab?: string): ComplianceFileTab {
  const key = (tab ?? "").trim().toLowerCase();
  if (CLIENT_ALIASES.has(key)) return "client";
  if (AGENCY_ALIASES.has(key) || POLICY_ALIASES.has(key) || CONTRACT_ALIASES.has(key)) return "agency";
  return "staff";
}

export function resolveAgencyFileSubTab(tab?: string): AgencyFileSubTab {
  const key = (tab ?? "").trim().toLowerCase();
  if (POLICY_ALIASES.has(key)) return "company-policies";
  if (CONTRACT_ALIASES.has(key)) return "contract-index";
  return "documents";
}

export function complianceSearchForFileTab(tab: ComplianceFileTab): ComplianceSearch {
  return { tab };
}

export function complianceSearchForAgencySubTab(sub: AgencyFileSubTab): ComplianceSearch {
  if (sub === "company-policies") return { tab: "company-policies" };
  if (sub === "contract-index") return { tab: "contract-index" };
  return { tab: "agency" };
}

export function complianceRedirectSearchFromAgencyDocuments(
  tab?: string,
): ComplianceSearch {
  const sub = resolveAgencyFileSubTab(tab);
  if (sub === "company-policies") return { tab: "company-policies" };
  if (sub === "contract-index") return { tab: "contract-index" };
  return { tab: "agency" };
}

/** Admin primary sidebar — twelve items. State Audit and Reports stay as routes. */
export const ADMIN_PRIMARY_NAV_LABELS = [
  "Home",
  "Employees",
  "Clients",
  "Scheduler",
  "Documentation",
  "Daily Logs",
  "Compliance",
  "Summaries",
  "Finances",
  "Training",
  "Inbox",
  "Settings",
] as const;

export type RetiredComplianceRedirect = {
  from: string;
  to: string;
  search?: Record<string, string>;
};

/** Bookmarks for retired parallel surfaces. Command Center → Home. */
export const RETIRED_COMPLIANCE_REDIRECTS: RetiredComplianceRedirect[] = [
  { from: "/dashboard/personnel-file", to: "/dashboard/compliance", search: { tab: "staff" } },
  { from: "/dashboard/client-file", to: "/dashboard/compliance", search: { tab: "client" } },
  { from: "/dashboard/agency-documents", to: "/dashboard/compliance", search: { tab: "agency" } },
  { from: "/dashboard/company-obligations", to: "/dashboard/compliance" },
  { from: "/dashboard/deadlines", to: "/dashboard/compliance", search: { tab: "staff" } },
  { from: "/dashboard/command-center", to: "/dashboard" },
  { from: "/dashboard/external-compliance", to: "/dashboard/hub/knowledge", search: { tab: "external" } },
];
