// Registry of stable tour anchors. Add a new entry here and the corresponding
// data-tour="..." attribute on the element. NECTAR's guided tours can only
// reference anchors that exist here — never invent IDs.

export type TourAnchor = {
  id: string;
  label: string;
  route: string;
  description: string;
};

export const TOUR_ANCHORS: TourAnchor[] = [
  // Sidebar navigation (admin)
  { id: "nav.audit", label: "Audit tab", route: "/dashboard/audit", description: "Open the Audit zone where audit folders and checklists live." },
  { id: "nav.authoritative-sources", label: "Authoritative Sources", route: "/dashboard/authoritative-sources", description: "Upload your SOW, contracts and DSPD/DHS requirement documents." },
  { id: "nav.nectar-docs", label: "NECTAR Docs", route: "/dashboard/nectar-docs", description: "Central document repository — parsed extracted fields and version history." },
  { id: "nav.records-desk", label: "Records Desk", route: "/dashboard/records-desk", description: "Review submitted timesheets, daily logs, EVV punches and incidents." },
  { id: "nav.billing", label: "Billing", route: "/dashboard/billing", description: "Billing forms, 520 generation, and exports." },
  { id: "nav.scheduling", label: "Scheduling", route: "/dashboard/scheduling", description: "Publish and edit staff shifts on the calendar." },
  { id: "nav.employees", label: "Employees", route: "/dashboard/employees", description: "Staff roster and profiles." },
  { id: "nav.clients", label: "Clients", route: "/dashboard/clients", description: "Client profiles, demographics and documents." },
  { id: "nav.teams", label: "Teams & Homes", route: "/dashboard/teams", description: "Team and home assignments." },
  { id: "nav.pba-ledger", label: "PBA Trust Ledger", route: "/dashboard/pba-ledger", description: "Client personal-budget accounts and audit samples." },
  { id: "nav.help", label: "Ask NECTAR", route: "/dashboard/help", description: "Chat with NECTAR for help anywhere in HIVE." },
  { id: "nav.settings", label: "Settings", route: "/dashboard/settings", description: "Organization settings." },

  // Auditor portal
  { id: "auditor.folders", label: "Shared folders list", route: "/auditor", description: "Folders shared with you by the provider." },

  // Page-level CTAs
  { id: "audit.body", label: "Audit zone body", route: "/dashboard/audit", description: "Where audit folders, items needed and items provided are shown." },
  { id: "authsources.upload", label: "Upload an authoritative source", route: "/dashboard/authoritative-sources", description: "Upload a State SOW, provider contract or requirement document." },
  { id: "nectardocs.body", label: "NECTAR Docs body", route: "/dashboard/nectar-docs", description: "Review parsed fields and version history." },
];

export function findAnchor(id: string): TourAnchor | undefined {
  return TOUR_ANCHORS.find((a) => a.id === id);
}

export function anchorsForPrompt(): string {
  return TOUR_ANCHORS.map((a) => `- ${a.id} (${a.route}) — ${a.description}`).join("\n");
}
