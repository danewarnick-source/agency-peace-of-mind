// Registry of stable tour anchors. Add a new entry here and the corresponding
// data-tour="..." attribute on the element. NECTAR's guided tours can only
// reference anchors that exist here — never invent IDs.

export type TourSurface = "admin" | "staff" | "both";

export type TourAnchor = {
  id: string;
  label: string;
  route: string;
  description: string;
  surface: TourSurface;
};

export const TOUR_ANCHORS: TourAnchor[] = [
  // Sidebar navigation (admin)
  { id: "nav.audit", label: "Audit tab", route: "/dashboard/audit", description: "Open the Audit zone where audit folders and checklists live.", surface: "admin" },
  { id: "nav.authoritative-sources", label: "Authoritative Sources", route: "/dashboard/authoritative-sources", description: "Upload your SOW, contracts and DSPD/DHS requirement documents.", surface: "admin" },
  { id: "nav.nectar-docs", label: "NECTAR Docs", route: "/dashboard/nectar-docs", description: "Central document repository — parsed extracted fields and version history.", surface: "admin" },
  { id: "nav.records-desk", label: "Records Desk", route: "/dashboard/records-desk", description: "Review submitted timesheets, daily logs, EVV punches and incidents.", surface: "admin" },
  { id: "nav.billing", label: "Billing", route: "/dashboard/billing", description: "Billing forms, 520 generation, and exports.", surface: "admin" },
  { id: "nav.scheduling", label: "Scheduling", route: "/dashboard/scheduling", description: "Publish and edit staff shifts on the calendar.", surface: "admin" },
  { id: "nav.employees", label: "Employees", route: "/dashboard/employees", description: "Staff roster and profiles.", surface: "admin" },
  { id: "nav.clients", label: "Clients", route: "/dashboard/clients", description: "Client profiles, demographics and documents.", surface: "admin" },
  { id: "nav.teams", label: "Teams & Homes", route: "/dashboard/teams", description: "Team and home assignments.", surface: "admin" },
  { id: "nav.pba-ledger", label: "PBA Trust Ledger", route: "/dashboard/pba-ledger", description: "Client personal-budget accounts and audit samples.", surface: "admin" },
  { id: "nav.help", label: "Ask NECTAR", route: "/dashboard/help", description: "Chat with NECTAR for help anywhere in HIVE.", surface: "admin" },
  { id: "nav.settings", label: "Settings", route: "/dashboard/settings", description: "Organization settings.", surface: "admin" },

  // Auditor portal
  { id: "auditor.folders", label: "Shared folders list", route: "/auditor", description: "Folders shared with you by the provider.", surface: "admin" },

  // Page-level CTAs (admin)
  { id: "audit.body", label: "Audit zone body", route: "/dashboard/audit", description: "Where audit folders, items needed and items provided are shown.", surface: "admin" },
  { id: "authsources.upload", label: "Upload an authoritative source", route: "/dashboard/authoritative-sources", description: "Upload a State SOW, provider contract or requirement document.", surface: "admin" },
  { id: "nectardocs.body", label: "NECTAR Docs body", route: "/dashboard/nectar-docs", description: "Review parsed fields and version history.", surface: "admin" },

  // Staff navigation — ids match data-tour={`nav.${slug}`} on the staff sidebar
  { id: "nav.home", label: "My Caseload", route: "/dashboard", description: "Your assigned people. Host-home (HHS) names open the daily note. Time-clock codes open Punch pad.", surface: "staff" },
  { id: "nav.schedule", label: "Schedule", route: "/dashboard/schedule", description: "Today and upcoming scheduled shifts.", surface: "staff" },
  { id: "nav.daily-logs", label: "Daily Logs", route: "/dashboard/daily-logs", description: "Host-home and RP5 daily progress notes.", surface: "staff" },
  { id: "nav.my-obligations", label: "My Compliance", route: "/dashboard/my-obligations", description: "Trainings, policies, and other items you still owe.", surface: "staff" },
  { id: "nav.my-historical-records", label: "Historical Records", route: "/dashboard/my-historical-records", description: "Past notes and timesheets brought over for you to review.", surface: "staff" },
  { id: "nav.my-time-corrections", label: "My Time Corrections", route: "/dashboard/my-time-corrections", description: "Correction requests you sent to a supervisor.", surface: "staff" },
  { id: "nav.ask-nectar", label: "Ask NECTAR", route: "/dashboard/ask-nectar", description: "Ask NECTAR a staff question about your shift, caseload, or a form.", surface: "staff" },
  { id: "nav.courses", label: "My Obligations", route: "/dashboard/my-obligations", description: "Assigned trainings and forms — staff only complete what is already on My Obligations.", surface: "staff" },
  { id: "nav.hive-training", label: "Classes", route: "/dashboard/hive-training", description: "Admin class roster for CPR, Mandt, and the training package.", surface: "admin" },

  // Staff page CTAs
  { id: "staff.caseload", label: "Caseload list", route: "/dashboard", description: "The list of people assigned to you. Tap an HHS name for the daily note.", surface: "staff" },
  { id: "staff.daily-note", label: "Daily progress note", route: "/dashboard/daily-logs", description: "Write the host-home daily note: goals, medications, and narrative.", surface: "staff" },
];

export function findAnchor(id: string): TourAnchor | undefined {
  return TOUR_ANCHORS.find((a) => a.id === id);
}

export function anchorsForSurface(surface: string): TourAnchor[] {
  const s = surface === "staff" ? "staff" : "admin";
  return TOUR_ANCHORS.filter((a) => a.surface === s || a.surface === "both");
}

export function anchorsForPrompt(surface = "admin"): string {
  return anchorsForSurface(surface)
    .map((a) => `- ${a.id} (${a.route}) — ${a.description}`)
    .join("\n");
}
