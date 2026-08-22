// Review-order sections for the Utah DSPD pack tab.
// Article 1 stays in SOW order so a reviewer can walk the PDF. Service-code
// articles, CST, and the In-depth Review Tool are separate collapses.

import { UTAH_DSPD_COVERAGE, type PackCoverageRow } from "./coverage";

export type PackSectionId =
  | "art1-contractor"
  | "art1-staff"
  | "art1-records"
  | "art1-policies"
  | "art1-planning"
  | "art1-ops"
  | "code-dsi"
  | "code-hhs"
  | "code-sei"
  | "code-slh-sln"
  | "code-other"
  | "cst"
  | "rt-I"
  | "rt-II"
  | "rt-III"
  | "rt-IV";

export type PackSection = {
  id: PackSectionId;
  title: string;
  hint: string;
  tnsPrimary?: boolean;
};

export const PACK_SECTIONS: PackSection[] = [
  {
    id: "art1-contractor",
    title: "Article 1 — Contractor qualifications",
    hint: "§1.1–1.7. Definitions, Medicaid enrollment, USTEPS/UPI, volunteers, Medicaid 101.",
  },
  {
    id: "art1-staff",
    title: "Article 1 — Staff training & personnel files",
    hint: "§1.8–1.9. Orientation, CPR, CE, ABI, background, disclosure, OIG.",
  },
  {
    id: "art1-records",
    title: "Article 1 — Records, EVV, Medicaid, UPI",
    hint: "§1.10–1.15. Person files, zoning, EVV, enrollment notices, 1056s.",
  },
  {
    id: "art1-policies",
    title: "Article 1 — Policies, rights, health, discharge",
    hint: "§1.16–1.23. Operating/personnel policies, HRC, Human Rights Plan, health policies.",
  },
  {
    id: "art1-planning",
    title: "Article 1 — Planning, summaries, incidents, funds",
    hint: "§1.24–1.28. Support Strategies, summaries, fatalities, IRs, PBA/loans, gifts.",
  },
  {
    id: "art1-ops",
    title: "Article 1 — Transportation & residential ops",
    hint: "§1.29–1.36. Nutrition, driving file, SC visits, worksheet, housemates, USDC.",
  },
  {
    id: "code-dsi",
    title: "DSI — Day Support for an Individual",
    hint: "Article 8. TNS-awarded. OL day license/cert + Aug 30 outcome report.",
    tnsPrimary: true,
  },
  {
    id: "code-hhs",
    title: "HHS — Host Home Supports",
    hint: "Article 11. TNS-awarded. Certification, drills, daily note, Aug 30 report.",
    tnsPrimary: true,
  },
  {
    id: "code-sei",
    title: "SEI — Supported Employment for an Individual",
    hint: "Article 30. TNS-awarded. UPI monthly, ACRE/USOR, Aug 30 report.",
    tnsPrimary: true,
  },
  {
    id: "code-slh-sln",
    title: "SLH / SLN — Supported Living",
    hint: "Articles 31–32. TNS-awarded (SLH, SLN). Belongings, EVV, CMP/CMS, outcome report.",
    tnsPrimary: true,
  },
  {
    id: "code-other",
    title: "Other service codes (not TNS-primary)",
    hint: "DSG/DSP, EPR, HSQ, PBA, PPS, RHS, SED, SEE, SJD, BC, and remaining articles. Encoded so the next tenant gets the right rows.",
  },
  {
    id: "cst",
    title: "Client Service Terms",
    hint: "Emergency plan, conflict of interest, IQMP, insurance, Code of Conduct, timesheets, background restatement.",
  },
  {
    id: "rt-I",
    title: "Review tool — Part I Administrative",
    hint: "Auditor checklist mapping. Confirm each paper-tool row points at the right duty or live artifact.",
  },
  {
    id: "rt-II",
    title: "Review tool — Part II Person records",
    hint: "Medical, strategies, summaries, grievance, HRC restrictions, belongings, leases.",
  },
  {
    id: "rt-III",
    title: "Review tool — Part III Fiscal / billing",
    hint: "Timesheets, EVV, billed-vs-description, HHS billable day.",
  },
  {
    id: "rt-IV",
    title: "Review tool — Part IV Staff requirements",
    hint: "Background, CoC, credentials, ACRE, OIG, orientation, CPR, CE, ABI, USOR.",
  },
];

function article1Section(n: number): PackSectionId {
  if (n <= 7) return "art1-contractor";
  if (n <= 9) return "art1-staff";
  if (n <= 15) return "art1-records";
  if (n <= 23) return "art1-policies";
  if (n <= 28) return "art1-planning";
  return "art1-ops";
}

export function packSectionId(row: PackCoverageRow): PackSectionId {
  if (row.source === "cst") return "cst";
  if (row.source === "review_tool") {
    if (row.id.startsWith("rt-IV")) return "rt-IV";
    if (row.id.startsWith("rt-III")) return "rt-III";
    if (row.id.startsWith("rt-II")) return "rt-II";
    if (row.id.startsWith("rt-I")) return "rt-I";
  }

  const art1 = /^sow-1\.(\d+)/.exec(row.id);
  if (art1) return article1Section(Number(art1[1]));

  if (row.id.startsWith("sow-8")) return "code-dsi";
  if (row.id.startsWith("sow-11")) return "code-hhs";
  if (row.id.startsWith("sow-30")) return "code-sei";
  if (row.id.startsWith("sow-31") || row.id.startsWith("sow-32")) return "code-slh-sln";

  return "code-other";
}

export function rowsForSection(
  id: PackSectionId,
  rows: PackCoverageRow[] = UTAH_DSPD_COVERAGE,
): PackCoverageRow[] {
  return rows.filter((r) => packSectionId(r) === id);
}

export function sectionedCoverage(rows: PackCoverageRow[] = UTAH_DSPD_COVERAGE) {
  return PACK_SECTIONS.map((section) => ({
    ...section,
    rows: rowsForSection(section.id, rows),
  }));
}

export function unsectionedRowIds(rows: PackCoverageRow[] = UTAH_DSPD_COVERAGE): string[] {
  const known = new Set(PACK_SECTIONS.map((s) => s.id));
  return rows.filter((r) => !known.has(packSectionId(r))).map((r) => r.id);
}
