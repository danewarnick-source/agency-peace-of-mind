/**
 * Agency Contract / SOW index (Compliance revamp Step 9c).
 * Static rows derived from the keyed catalog, standing duties, SOW
 * perimeters (R1–R5), and encoded EVV / daily-rate / cadence rules.
 * ~300 searchable rows. No invented duties — only what the product already
 * encodes. Promote overlay stays on the Step 7 catalog-relation path.
 */
import { EVV_SERVICE_CODES } from "./evv-codes.ts";
import { DAILY_SERVICE_CODES } from "./service-billing.ts";
import {
  allSowCatalogEntries,
  CATEGORY_LABEL,
  type SowCatalogEntry,
} from "./sow-obligation-catalog.ts";
import { STANDING_SOW_DUTIES } from "./standing-sow-duties.ts";

/** Same keys as SOW_TRAINING_KEYS in sow-perimeters.functions.ts. */
const PERIMETER_TRAINING = {
  THIRTY_DAY: "thirty_day",
  ABI: "abi",
  DEESCALATION: "deescalation",
} as const;

export const SOW_INDEX_SOURCES = [
  "catalog",
  "catalog_evidence",
  "catalog_code",
  "standing",
  "perimeter",
  "evv",
  "daily_rate",
  "cadence",
] as const;
export type SowIndexSource = (typeof SOW_INDEX_SOURCES)[number];

export type SowIndexRow = {
  id: string;
  source: SowIndexSource;
  key: string;
  title: string;
  citation: string;
  topic: string;
  service_codes: string[];
  summary: string;
};

const MONTHLY_SUMMARY_CODES = ["SEI", "SJD", "CMP", "CMS", "PN1", "PN2"] as const;
const QUARTERLY_SUMMARY_CODES = ["HHS", "RHS", "DSI", "SLH", "SLN"] as const;

const PERIMETER_ROWS: Array<Omit<SowIndexRow, "id">> = [
  {
    source: "perimeter",
    key: "sow_r1_abi",
    title: "ABI training before working alone",
    citation: "DHHS91172 SOW perimeter R1",
    topic: "Staff training",
    service_codes: [],
    summary: `profiles.requires_abi + current ${PERIMETER_TRAINING.ABI} completion.`,
  },
  {
    source: "perimeter",
    key: "sow_r2_deescalation",
    title: "De-escalation certification when required",
    citation: "DHHS91172 SOW perimeter R2",
    topic: "Staff training",
    service_codes: [],
    summary: `profiles.requires_deescalation + current ${PERIMETER_TRAINING.DEESCALATION} completion.`,
  },
  {
    source: "perimeter",
    key: "sow_r3_thirty_day",
    title: "30-day new-hire orientation",
    citation: "DHHS91172 SOW perimeter R3",
    topic: "Staff training",
    service_codes: [],
    summary: `Active org member + current ${PERIMETER_TRAINING.THIRTY_DAY} completion.`,
  },
  {
    source: "perimeter",
    key: "sow_r4_incident_24h",
    title: "Incident 24-hour state deadline",
    citation: "DHHS91172 SOW perimeter R4",
    topic: "State reporting",
    service_codes: [],
    summary: "incident_reports past state_submission_deadline.",
  },
  {
    source: "perimeter",
    key: "sow_r5_untraced_requirement",
    title: "Untraced or unmet nectar requirement",
    citation: "DHHS91172 SOW perimeter R5",
    topic: "Agency file",
    service_codes: [],
    summary: "nectar_requirements with unmet tracking cadence.",
  },
];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function catalogRows(entry: SowCatalogEntry): SowIndexRow[] {
  const topic = CATEGORY_LABEL[entry.category];
  const rows: SowIndexRow[] = [
    {
      id: `catalog:${entry.key}`,
      source: "catalog",
      key: entry.key,
      title: entry.title,
      citation: entry.citation,
      topic,
      service_codes: [...entry.service_codes],
      summary: entry.fulfillment_note,
    },
    {
      id: `catalog_evidence:${entry.key}`,
      source: "catalog_evidence",
      key: `${entry.key}__evidence`,
      title: `${entry.title} — evidence`,
      citation: entry.citation,
      topic,
      service_codes: [...entry.service_codes],
      summary: entry.evidence_standard,
    },
  ];
  for (const code of entry.service_codes) {
    rows.push({
      id: `catalog_code:${entry.key}:${code}`,
      source: "catalog_code",
      key: `${entry.key}__${code}`,
      title: `${entry.title} — ${code}`,
      citation: entry.citation,
      topic,
      service_codes: [code],
      summary: `Applies when the org runs ${code}. ${entry.fulfillment_note}`,
    });
  }
  return rows;
}

let cached: SowIndexRow[] | null = null;

export function buildSowIndex(): SowIndexRow[] {
  if (cached) return cached;
  const rows: SowIndexRow[] = [];

  for (const entry of allSowCatalogEntries()) {
    rows.push(...catalogRows(entry));
  }

  for (const duty of STANDING_SOW_DUTIES) {
    rows.push({
      id: `standing:${slug(duty.title)}`,
      source: "standing",
      key: `standing_${slug(duty.title)}`,
      title: duty.title,
      citation: duty.source_policy_section,
      topic: "Standing records",
      service_codes: [...duty.target_service_codes],
      summary: duty.description,
    });
  }

  for (const row of PERIMETER_ROWS) {
    rows.push({ ...row, id: `perimeter:${row.key}` });
  }

  for (const code of EVV_SERVICE_CODES) {
    rows.push({
      id: `evv:${code.code}`,
      source: "evv",
      key: `evv_${code.code}`,
      title: code.label,
      citation: code.evvLock ? "DHHS91172 SOW §1.12" : "DHHS91172 SOW (time capture only)",
      topic: code.evvLock ? "EVV-mandated" : "Payroll / evidence only",
      service_codes: [code.code],
      summary: code.evvLock
        ? "Geofence + UEVV CSV. State path is Utah DHHS EVV CSV, not a live UEVV API."
        : "Time capture for payroll / evidence only. Not EVV-mandated.",
    });
  }

  for (const code of DAILY_SERVICE_CODES) {
    rows.push({
      id: `daily:${code}`,
      source: "daily_rate",
      key: `daily_${code}`,
      title: `${code} daily-rate billing`,
      citation: "DHHS91172 service-billing daily-rate set",
      topic: "Billing",
      service_codes: [code],
      summary: "Daily-rate code. Units are not quarter-hour punches.",
    });
  }

  for (const code of MONTHLY_SUMMARY_CODES) {
    rows.push({
      id: `cadence:monthly:${code}`,
      source: "cadence",
      key: `summary_monthly_${code}`,
      title: `${code} monthly summary`,
      citation: "DHHS91172 summary cadence (eff 7/1/26)",
      topic: "State reporting",
      service_codes: [code],
      summary: "Monthly summary due the 15th. SEI is typed into UPI (admin-only).",
    });
  }
  for (const code of QUARTERLY_SUMMARY_CODES) {
    rows.push({
      id: `cadence:quarterly:${code}`,
      source: "cadence",
      key: `summary_quarterly_${code}`,
      title: `${code} quarterly summary`,
      citation: "DHHS91172 summary cadence (eff 7/1/26)",
      topic: "State reporting",
      service_codes: [code],
      summary: "Quarterly summary due 15 days after quarter end.",
    });
  }

  cached = rows;
  return rows;
}

export function sowIndexRowCount(): number {
  return buildSowIndex().length;
}

export function searchSowIndex(query: string): SowIndexRow[] {
  const q = query.trim().toLowerCase();
  const all = buildSowIndex();
  if (!q) return all;
  return all.filter((row) => {
    const hay = `${row.title} ${row.citation} ${row.key} ${row.topic} ${row.summary} ${row.service_codes.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}

export function sowIndexByKey(key: string): SowIndexRow | null {
  return buildSowIndex().find((row) => row.key === key || row.id === key) ?? null;
}
