/**
 * Agency documents — org-wide company surface (DSPD / Practice Audit layers).
 * Card titles are the locked Dane labels. Statuses are only On file | Missing | Due soon.
 * One card per duty; renew uses the same card. Company policies stay off this pack.
 */

import {
  obligationFileStatusLabel,
  statusForObligationInstance,
  type ObligationFileStatus,
} from "./staff-obligation-files.ts";

export const AGENCY_DOC_STATUS_LABEL = {
  on_file: "On file",
  due_soon: "Due soon",
  missing: "Missing",
} as const;

export type AgencyDocStatus = ObligationFileStatus;

export const AGENCY_DOC_LAYERS = ["flag", "encoded"] as const;
export type AgencyDocLayer = (typeof AGENCY_DOC_LAYERS)[number];

export const AGENCY_DOC_FLAG_KEYS = [
  "insurance",
  "commerce",
  "medicaid_standing",
  "ol_licenses",
  "host_home",
  "pps_foster",
  "facility_safety",
  "coc_posted",
  "enrollment",
  "baa",
  "board",
] as const;

export const AGENCY_DOC_ENCODED_KEYS = [
  "coi",
  "continuity",
  "personnel_operating",
  "hrc_hrp",
  "no_gifts",
  "discharge",
  "iqm",
  "large_loan",
  "incident_process",
  "hipaa_npp",
] as const;

export const AGENCY_DOC_CARD_KEYS = [
  ...AGENCY_DOC_FLAG_KEYS,
  ...AGENCY_DOC_ENCODED_KEYS,
] as const;

export type AgencyDocCardKey = (typeof AGENCY_DOC_CARD_KEYS)[number];

export const AGENCY_DOC_CARD_TITLE: Record<AgencyDocCardKey, string> = {
  insurance: "Insurance",
  commerce: "Commerce",
  medicaid_standing: "Medicaid standing",
  ol_licenses: "OL day/residential licenses",
  host_home: "Host Home+inspections",
  pps_foster: "PPS foster license",
  facility_safety: "Facility/licensure safety",
  coc_posted: "COC posted",
  enrollment: "Enrollment",
  baa: "BAA",
  board: "Board",
  coi: "COI policy",
  continuity: "Continuity plan",
  personnel_operating: "Personnel+operating pack",
  hrc_hrp: "HRC charter+HRP setup",
  no_gifts: "No-gifts process",
  discharge: "Discharge process",
  iqm: "IQM plan",
  large_loan: "Large-loan disclosure process",
  incident_process: "Incident reporting process",
  hipaa_npp: "HIPAA NPP",
};

/** Existing company_obligations titles that feed each card. Do not invent extra duties. */
export const AGENCY_DOC_OBLIGATION_TITLES: Record<AgencyDocCardKey, readonly string[]> = {
  insurance: ["General, Professional, and Automobile Liability Insurance"],
  commerce: ["Utah Department of Commerce — Entity Standing"],
  medicaid_standing: ["USTEPS and UPI Contractor Accounts"],
  ol_licenses: [
    "OL Day Treatment License — 4+ Persons",
    "OL Day Support Certification — 3 or Fewer Persons",
    "OL Residential Support License — 4+ Persons per Site",
    "OL Residential Support Certification — 3 or Fewer Persons per Site",
  ],
  host_home: ["HHS Home Certification — Annual (DSPD Form)"],
  pps_foster: ["Child Placing / Foster Care License (DHHS/OL) — PPS"],
  facility_safety: ["Zoning / Life Safety Code Compliance Documentation"],
  coc_posted: ["DHHS Code of Conduct — Posted"],
  enrollment: ["Medicaid Provider Enrollment — Current"],
  baa: ["Business Associate Agreements — On File"],
  board: ["Governing or Policy-Making Board Records"],
  coi: ["Staff Conflict of Interest Process"],
  continuity: ["Emergency Management and Business Continuity Plan"],
  personnel_operating: [
    "Personnel Policies and Job Descriptions",
    "Operating Policies and Procedures",
  ],
  hrc_hrp: ["Human Rights Plan"],
  no_gifts: ["No Gifts or Purchases-from-Staff Process"],
  discharge: ["Person Discharge Process"],
  iqm: ["Internal Quality Management Plan"],
  large_loan: ["Large-Loan Disclosure Process"],
  incident_process: ["Incident Reporting Process"],
  hipaa_npp: ["HIPAA Notice of Privacy Practices"],
};

const DAY_LICENSE_TITLES = new Set([
  "OL Day Treatment License — 4+ Persons",
  "OL Day Support Certification — 3 or Fewer Persons",
]);
const RESIDENTIAL_LICENSE_TITLES = new Set([
  "OL Residential Support License — 4+ Persons per Site",
  "OL Residential Support Certification — 3 or Fewer Persons per Site",
]);
const DAY_CODES = new Set(["DSI", "DSG", "DSP", "EPR"]);
const RHS_CODES = new Set(["RHS"]);
const HHS_CODES = new Set(["HHS"]);
const PPS_CODES = new Set(["PPS"]);

export type AgencyDocDef = {
  key: AgencyDocCardKey;
  title: string;
  layer: AgencyDocLayer;
  titles: readonly string[];
  codes: readonly string[];
};

export const AGENCY_DOC_DEFS: AgencyDocDef[] = AGENCY_DOC_CARD_KEYS.map((key) => {
  const layer: AgencyDocLayer = (AGENCY_DOC_FLAG_KEYS as readonly string[]).includes(key)
    ? "flag"
    : "encoded";
  let codes: readonly string[] = [];
  if (key === "ol_licenses") codes = ["DSI", "DSG", "DSP", "EPR", "RHS"];
  if (key === "host_home") codes = ["HHS"];
  if (key === "pps_foster") codes = ["PPS"];
  return {
    key,
    title: AGENCY_DOC_CARD_TITLE[key],
    layer,
    titles: AGENCY_DOC_OBLIGATION_TITLES[key],
    codes,
  };
});

const TITLE_TO_KEY = new Map<string, AgencyDocCardKey>();
for (const def of AGENCY_DOC_DEFS) {
  for (const title of def.titles) {
    TITLE_TO_KEY.set(title.trim().toLowerCase(), def.key);
  }
}

export function agencyDocStatusLabel(status: AgencyDocStatus): string {
  return obligationFileStatusLabel(status);
}

export function agencyDocKeyForTitle(title: string): AgencyDocCardKey | null {
  return TITLE_TO_KEY.get(title.trim().toLowerCase()) ?? null;
}

export function isAgencyDocumentTitle(title: string): boolean {
  return agencyDocKeyForTitle(title) !== null;
}

export function isCompanyPolicyObligation(ob: {
  source?: string | null;
  agency_policy_id?: string | null;
  source_policy_section?: string | null;
}): boolean {
  if (ob.agency_policy_id) return true;
  if ((ob.source ?? "").toLowerCase() === "provider") return true;
  return /contractor.s own policies/i.test(ob.source_policy_section ?? "");
}

export function codesHas(codes: string[], set: Set<string> | readonly string[]): boolean {
  const want = set instanceof Set ? set : new Set(set);
  return codes.some((c) => want.has(c.toUpperCase()));
}

export function agencyDocApplies(key: AgencyDocCardKey, codes: string[]): boolean {
  switch (key) {
    case "ol_licenses":
      return codesHas(codes, DAY_CODES) || codesHas(codes, RHS_CODES);
    case "host_home":
      return codesHas(codes, HHS_CODES);
    case "pps_foster":
      return codesHas(codes, PPS_CODES);
    default:
      return true;
  }
}

export type AgencyDocInstance = {
  title: string;
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  dueAt: string;
  instanceUploadPath?: string | null;
  instanceUploadFilename?: string | null;
  obligationId: string;
  instanceId: string | null;
  evidenceType?: "attestation" | "upload" | "upload_and_attestation" | "form" | null;
  attestationText?: string | null;
};

export type AgencyDocCard = {
  key: AgencyDocCardKey;
  title: string;
  layer: AgencyDocLayer;
  status: AgencyDocStatus;
  dueAt: string | null;
  obligationId: string | null;
  instanceId: string | null;
  evidencePath: string | null;
  evidenceFilename: string | null;
  evidenceType: "attestation" | "upload" | "upload_and_attestation" | "form" | null;
  attestationText: string | null;
  coreSeedNeeded: boolean;
};

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

function hasFile(row: AgencyDocInstance): boolean {
  return (
    row.instanceStatus === "completed" ||
    row.instanceStatus === "waived" ||
    !!row.instanceUploadPath
  );
}

function pickOpen(instances: AgencyDocInstance[]): AgencyDocInstance | null {
  const overdue = instances
    .filter((i) => i.instanceStatus === "overdue")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  if (overdue[0]) return overdue[0];
  const pending = instances
    .filter((i) => i.instanceStatus === "pending")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return pending[0] ?? null;
}

function pickCurrent(instances: AgencyDocInstance[]): AgencyDocInstance | null {
  if (!instances.length) return null;
  return (
    pickOpen(instances) ??
    instances.find((r) => hasFile(r)) ??
    [...instances].sort((a, b) => b.dueAt.localeCompare(a.dueAt))[0] ??
    null
  );
}

function instanceStatus(row: AgencyDocInstance, now: Date): AgencyDocStatus {
  return statusForObligationInstance({
    instanceStatus: row.instanceStatus,
    dueAt: row.dueAt,
    instanceUploadPath: row.instanceUploadPath,
    now,
  });
}

/** Same card on renew: current file stays On file until the next due window. */
function statusForDuty(rows: AgencyDocInstance[], now: Date): {
  status: AgencyDocStatus;
  dueAt: string | null;
  current: AgencyDocInstance | null;
} {
  const current = pickCurrent(rows);
  if (!rows.length) return { status: "missing", dueAt: null, current: null };
  const onFile = rows.some((r) => hasFile(r));
  const open = pickOpen(rows);
  const dueAt = open?.dueAt && open.dueAt ? open.dueAt : null;
  if (dueAt) {
    const due = new Date(dueAt).getTime();
    if (!Number.isNaN(due)) {
      if (due < now.getTime()) return { status: "missing", dueAt, current: open ?? current };
      if (due - now.getTime() <= DUE_SOON_MS) {
        return { status: "due_soon", dueAt, current: open ?? current };
      }
    }
  }
  if (onFile) return { status: "on_file", dueAt: null, current };
  if (open) return { status: instanceStatus(open, now), dueAt, current: open };
  return { status: "missing", dueAt, current };
}

function combineStatuses(parts: AgencyDocStatus[]): AgencyDocStatus {
  if (parts.some((s) => s === "missing")) return "missing";
  if (parts.some((s) => s === "due_soon")) return "due_soon";
  if (parts.length > 0 && parts.every((s) => s === "on_file")) return "on_file";
  return "missing";
}

function groupOnFile(rows: AgencyDocInstance[], titles: Set<string>): boolean {
  return rows.some((r) => titles.has(r.title) && hasFile(r));
}

export function buildAgencyDocCards(
  rows: AgencyDocInstance[],
  codes: string[],
  now: Date = new Date(),
): AgencyDocCard[] {
  const byTitle = new Map<string, AgencyDocInstance[]>();
  for (const row of rows) {
    const list = byTitle.get(row.title) ?? [];
    list.push(row);
    byTitle.set(row.title, list);
  }

  const cards: AgencyDocCard[] = [];
  for (const def of AGENCY_DOC_DEFS) {
    if (!agencyDocApplies(def.key, codes)) continue;
    const matched = def.titles.flatMap((t) => byTitle.get(t) ?? []);
    const coreSeedNeeded = matched.length === 0;
    let resolved = statusForDuty(matched, now);

    if (def.key === "ol_licenses") {
      const needDay = codesHas(codes, DAY_CODES);
      const needRhs = codesHas(codes, RHS_CODES);
      const parts: AgencyDocStatus[] = [];
      if (needDay) parts.push(groupOnFile(matched, DAY_LICENSE_TITLES) ? "on_file" : "missing");
      if (needRhs) {
        parts.push(groupOnFile(matched, RESIDENTIAL_LICENSE_TITLES) ? "on_file" : "missing");
      }
      const open = statusForDuty(matched, now);
      resolved = {
        ...open,
        status: combineStatuses(parts.length ? parts : ["missing"]),
      };
    } else if (def.key === "personnel_operating") {
      const parts = def.titles.map((title) => statusForDuty(byTitle.get(title) ?? [], now).status);
      const openDue = def.titles
        .map((title) => statusForDuty(byTitle.get(title) ?? [], now))
        .filter((r) => r.status !== "on_file" && r.dueAt)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
      resolved = {
        ...statusForDuty(matched, now),
        status: combineStatuses(parts),
        dueAt: openDue[0]?.dueAt ?? null,
      };
    }

    const current = resolved.current;
    cards.push({
      key: def.key,
      title: def.title,
      layer: def.layer,
      status: resolved.status,
      dueAt: resolved.dueAt,
      obligationId: current?.obligationId ?? null,
      instanceId: current?.instanceId ?? null,
      evidencePath: current?.instanceUploadPath ?? null,
      evidenceFilename: current?.instanceUploadFilename ?? null,
      evidenceType: current?.evidenceType ?? null,
      attestationText: current?.attestationText ?? null,
      coreSeedNeeded,
    });
  }
  return cards;
}

export type AgencyDocCounts = {
  missing: number;
  due_soon: number;
  on_file: number;
};

export function tallyAgencyDocCards(cards: AgencyDocCard[]): AgencyDocCounts {
  const counts: AgencyDocCounts = { missing: 0, due_soon: 0, on_file: 0 };
  for (const card of cards) counts[card.status] += 1;
  return counts;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function missingAgencyDocCsv(cards: AgencyDocCard[]): string {
  const missing = cards.filter((c) => c.status === "missing");
  const header = ["Layer", "Item", "Status", "Due", "Core seed needed"];
  const lines = [
    header.map(csvCell).join(","),
    ...missing.map((c) =>
      [
        c.layer === "flag" ? "Flag" : "Encoded",
        c.title,
        agencyDocStatusLabel(c.status),
        c.dueAt ?? "",
        c.coreSeedNeeded ? "yes" : "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

export function agencyDocPackHtml(
  files: Array<{ title: string; filename: string; url: string }>,
): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const body = files
    .map((f) => {
      const media = /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.filename)
        ? `<img src="${escape(f.url)}" alt="" style="max-width:100%;" />`
        : `<iframe src="${escape(f.url)}" style="width:100%;height:80vh;border:0;"></iframe>`;
      return `<section style="page-break-after:always;margin-bottom:24px;"><h2 style="font:600 16px system-ui;">${escape(f.title)}</h2>${media}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><title>Agency file</title></head><body>${body}</body></html>`;
}

/** Internal templates only — never DSPD-encoded Agency document cards. */
export const COMPANY_POLICY_TEMPLATES = [
  { key: "cell_phone", title: "Cell phone use" },
  { key: "vehicle", title: "Vehicle policy" },
  { key: "visitor", title: "Visitor rules" },
] as const;

export type CompanyPolicyTemplateKey = (typeof COMPANY_POLICY_TEMPLATES)[number]["key"];
