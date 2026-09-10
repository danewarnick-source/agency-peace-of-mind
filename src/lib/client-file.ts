/**
 * Client file cards — same On file / Due soon / Missing labels as Personnel file.
 * One card per duty; renew keeps the same card. HRC restrictions stay in HRC.
 */

import {
  obligationFileStatusLabel,
  type ObligationFileStatus,
} from "./staff-obligation-files.ts";
import { personNeedsSupportStrategies } from "./audit-evidence.ts";
import {
  bucketCodes,
  isPeriodInProgress,
  recentMonthlyPeriods,
  recentQuarterlyPeriods,
} from "./progress-summaries.ts";

export const CLIENT_FILE_STATUS_LABEL = {
  on_file: "On file",
  due_soon: "Due soon",
  missing: "Missing",
} as const;

export type ClientFileStatus = ObligationFileStatus;

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export const CLIENT_FILE_CARD_KEYS = [
  "photograph",
  "pcsp",
  "grievance",
  "support_strategies",
  "service_summary",
  "clinical_legal",
  "housemate",
  "belongings",
  "lease_rb",
  "money_funds",
] as const;

export type ClientFileCardKey = (typeof CLIENT_FILE_CARD_KEYS)[number];

export const CLIENT_FILE_CARD_TITLE: Record<ClientFileCardKey, string> = {
  photograph: "Photograph",
  pcsp: "PCSP / planning documents",
  grievance: "Grievance receipt",
  support_strategies: "Support Strategies",
  service_summary: "Service summary",
  clinical_legal: "Client clinical/legal file area",
  housemate: "Housemate discussion",
  belongings: "Belongings inventory",
  lease_rb: "Lease/R&B",
  money_funds: "Money/funds",
};

export const BELONGINGS_CODES = new Set(["HHS", "RHS", "SLH"]);
export const HOUSEMATE_CODES = new Set(["HHS", "PPS", "RHS"]);
export const RNB_CODES = new Set(["HHS", "PPS"]);
export const LEASE_CODES = new Set(["RHS"]);
export const FUNDS_CODES = new Set(["PBA"]);

const PCSP_DOC_TYPES = new Set(["pcsp", "person-centered", "person_centered", "individualized_plan"]);
const GRIEVANCE_DOC_TYPES = new Set(["grievance_acknowledgment", "grievance_policy"]);
const CLINICAL_LEGAL_DOC_TYPES = new Set([
  "medical_exam",
  "dental_exam",
  "contract",
  "guardian",
]);
const STRATEGY_DOC_TYPES = new Set(["support_strategies", "bsp", "behavior_support_plan"]);
const RNB_DOC_TYPES = new Set(["room_board_agreement"]);
const LEASE_DOC_TYPES = new Set(["lease_agreement", "lease"]);
const HOUSEMATE_DOC_TYPES = new Set(["housemate", "housemate_discussion", "housemate_informed_choice"]);

export function clientFileStatusLabel(status: ClientFileStatus): string {
  return obligationFileStatusLabel(status);
}

/**
 * Client-file status. On file when the artifact is current.
 * Due soon in the 7-day window before a due/expiration (renews the same card).
 * Expired or absent is Missing.
 */
export function clientFileStatus(args: {
  onFile: boolean;
  dueAt?: string | null;
  now?: Date;
}): ClientFileStatus {
  const now = (args.now ?? new Date()).getTime();
  if (args.dueAt) {
    const due = new Date(args.dueAt).getTime();
    if (!Number.isNaN(due)) {
      if (due < now) return "missing";
      if (due - now <= DUE_SOON_MS) return "due_soon";
    }
  }
  return args.onFile ? "on_file" : "missing";
}

export function codesHas(codes: string[], set: Set<string>): boolean {
  return codes.some((c) => set.has(c.toUpperCase()));
}

export function cardApplies(key: ClientFileCardKey, codes: string[]): boolean {
  switch (key) {
    case "support_strategies":
      return personNeedsSupportStrategies(codes);
    case "housemate":
      return codesHas(codes, HOUSEMATE_CODES);
    case "belongings":
      return codesHas(codes, BELONGINGS_CODES);
    case "lease_rb":
      return codesHas(codes, RNB_CODES) || codesHas(codes, LEASE_CODES);
    case "money_funds":
      return codesHas(codes, FUNDS_CODES);
    default:
      return true;
  }
}

export type ClientFileDoc = {
  document_type: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  uploaded_at?: string | null;
};

export type ClientFileSummary = {
  status: string | null;
  due_date: string;
  finalized_at: string | null;
  requires_upi_attestation?: boolean | null;
  upi_entered_at?: string | null;
  period_label?: string | null;
};

export type ClientFileFacts = {
  codes: string[];
  photoPath: string | null;
  isOwnGuardian: boolean;
  grievanceOk: boolean;
  pcspExpiration: string | null;
  docs: ClientFileDoc[];
  belongingsOn: string | null;
  supportStrategiesOk: boolean;
  supportStrategiesDueAt: string | null;
  housemateOnFile: boolean;
  housemateDueAt: string | null;
  summaries: ClientFileSummary[];
  hasPbaAccount: boolean;
};

export type ClientFileCard = {
  key: ClientFileCardKey;
  title: string;
  status: ClientFileStatus;
  dueAt: string | null;
  href: string;
  evidencePath: string | null;
  evidenceFilename: string | null;
  evidenceBucket: "client-documents" | "client-photos" | null;
};

function normType(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function docsOfType(docs: ClientFileDoc[], types: Set<string>): ClientFileDoc[] {
  return docs.filter((d) => types.has(normType(d.document_type)));
}

function firstEvidence(docs: ClientFileDoc[]): {
  path: string | null;
  filename: string | null;
} {
  const hit = docs.find((d) => d.storage_path);
  return {
    path: hit?.storage_path ?? null,
    filename: hit?.file_name ?? null,
  };
}

function addYear(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function latestClosedOwedDue(codes: string[], now: Date): string | null {
  const buckets = bucketCodes(codes);
  const owed: string[] = [];
  if (buckets.quarterly.size) {
    for (const p of recentQuarterlyPeriods(now, 1)) {
      if (!isPeriodInProgress(p.period_end, now)) owed.push(p.due_date);
    }
  }
  if (buckets.monthlyNarrative.size || buckets.monthlyFinancial.size) {
    for (const p of recentMonthlyPeriods(now, 1)) {
      if (!isPeriodInProgress(p.period_end, now)) owed.push(p.due_date);
    }
  }
  owed.sort((a, b) => b.localeCompare(a));
  return owed[0] ?? null;
}

function summaryCard(facts: ClientFileFacts, now: Date): { onFile: boolean; dueAt: string | null } {
  const owedDue = latestClosedOwedDue(facts.codes, now);
  const latest = facts.summaries[0] ?? null;
  if (!latest && !owedDue) return { onFile: false, dueAt: null };
  if (!latest) return { onFile: false, dueAt: owedDue };

  const overdue = facts.summaries.filter((s) => {
    const due = s.due_date.slice(0, 10);
    const finalized = s.status === "finalized" || !!s.finalized_at;
    const upiGap = s.requires_upi_attestation && finalized && !s.upi_entered_at && due < now.toISOString().slice(0, 10);
    return (due < now.toISOString().slice(0, 10) && !finalized) || upiGap;
  });
  const latestFinal = latest.status === "finalized" || !!latest.finalized_at;
  const latestUpiOk = !latest.requires_upi_attestation || !!latest.upi_entered_at;
  const onFile = overdue.length === 0 && latestFinal && latestUpiOk;
  if (onFile) return { onFile: true, dueAt: null };
  return { onFile: false, dueAt: overdue[0]?.due_date ?? latest.due_date ?? owedDue };
}

function clinicalLegalOnFile(facts: ClientFileFacts): boolean {
  const types = new Set(facts.docs.map((d) => normType(d.document_type)));
  const exams = types.has("medical_exam") && types.has("dental_exam");
  if (!exams) return false;
  if (facts.isOwnGuardian) return true;
  return types.has("contract") || types.has("guardian");
}

export function buildClientFileCards(
  clientId: string,
  facts: ClientFileFacts,
  now: Date = new Date(),
): ClientFileCard[] {
  const profile = `/dashboard/clients/${clientId}`;
  const cards: ClientFileCard[] = [];

  const push = (
    key: ClientFileCardKey,
    onFile: boolean,
    dueAt: string | null,
    href: string,
    evidence?: { path: string | null; filename: string | null; bucket: ClientFileCard["evidenceBucket"] },
  ) => {
    if (!cardApplies(key, facts.codes)) return;
    cards.push({
      key,
      title: CLIENT_FILE_CARD_TITLE[key],
      status: clientFileStatus({ onFile, dueAt, now }),
      dueAt,
      href,
      evidencePath: evidence?.path ?? null,
      evidenceFilename: evidence?.filename ?? null,
      evidenceBucket: evidence?.bucket ?? null,
    });
  };

  const pcspDocs = docsOfType(facts.docs, PCSP_DOC_TYPES);
  const grievanceDocs = docsOfType(facts.docs, GRIEVANCE_DOC_TYPES);
  const clinicalDocs = docsOfType(facts.docs, CLINICAL_LEGAL_DOC_TYPES);
  const rnbDocs = docsOfType(facts.docs, RNB_DOC_TYPES);
  const leaseDocs = docsOfType(facts.docs, LEASE_DOC_TYPES);
  const housemateDocs = docsOfType(facts.docs, HOUSEMATE_DOC_TYPES);
  const strategyDocs = docsOfType(facts.docs, STRATEGY_DOC_TYPES);

  push(
    "photograph",
    !!facts.photoPath,
    null,
    `${profile}?tab=identity`,
    facts.photoPath
      ? { path: facts.photoPath, filename: "photograph", bucket: "client-photos" }
      : undefined,
  );

  const pcspOnFile = pcspDocs.length > 0;
  push(
    "pcsp",
    pcspOnFile && !(facts.pcspExpiration && facts.pcspExpiration < now.toISOString().slice(0, 10)),
    facts.pcspExpiration,
    `${profile}?tab=client-file`,
    { ...firstEvidence(pcspDocs), bucket: "client-documents" },
  );

  push(
    "grievance",
    facts.grievanceOk || grievanceDocs.length > 0,
    null,
    `${profile}?tab=identity`,
    { ...firstEvidence(grievanceDocs), bucket: "client-documents" },
  );

  push(
    "support_strategies",
    facts.supportStrategiesOk || strategyDocs.length > 0,
    facts.supportStrategiesOk ? null : facts.supportStrategiesDueAt,
    `${profile}?tab=operations`,
    { ...firstEvidence(strategyDocs), bucket: "client-documents" },
  );

  const summary = summaryCard(facts, now);
  push("service_summary", summary.onFile, summary.dueAt, "/dashboard/summaries");

  push(
    "clinical_legal",
    clinicalLegalOnFile(facts),
    null,
    `${profile}?tab=client-file`,
    { ...firstEvidence(clinicalDocs), bucket: "client-documents" },
  );

  const housemateOnFile = facts.housemateOnFile || housemateDocs.length > 0;
  push(
    "housemate",
    housemateOnFile,
    housemateOnFile ? null : facts.housemateDueAt,
    `${profile}?tab=client-file`,
    { ...firstEvidence(housemateDocs), bucket: "client-documents" },
  );

  const belongDue = facts.belongingsOn ? addYear(facts.belongingsOn) : null;
  push("belongings", !!facts.belongingsOn, belongDue, `${profile}?tab=identity`);

  const needsRnb = codesHas(facts.codes, RNB_CODES);
  const needsLease = codesHas(facts.codes, LEASE_CODES);
  const leaseOk =
    (!needsRnb || rnbDocs.length > 0) && (!needsLease || leaseDocs.length > 0) && (needsRnb || needsLease);
  const leaseEvidence = firstEvidence(needsLease ? leaseDocs : rnbDocs);
  push(
    "lease_rb",
    leaseOk,
    null,
    `${profile}?tab=client-file`,
    { ...leaseEvidence, bucket: "client-documents" },
  );

  push("money_funds", facts.hasPbaAccount, null, `${profile}?tab=billing`);

  return cards;
}

export type ClientFileCounts = {
  missing: number;
  due_soon: number;
  on_file: number;
};

export function tallyClientFileCards(cards: ClientFileCard[]): ClientFileCounts {
  const counts: ClientFileCounts = { missing: 0, due_soon: 0, on_file: 0 };
  for (const card of cards) counts[card.status] += 1;
  return counts;
}

export type ClientFileMissingCsvRow = {
  full_name: string;
  service_codes: string[];
  missing: number;
  due_soon: number;
  on_file: number;
  missing_items: Array<{ title: string; due_at: string | null }>;
};

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function missingClientFileCsv(rows: ClientFileMissingCsvRow[]): string {
  const header = ["Client", "Service codes", "Missing", "Due soon", "On file", "Missing items"];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.full_name,
        r.service_codes.join(" "),
        String(r.missing),
        String(r.due_soon),
        String(r.on_file),
        r.missing_items.map((i) => i.title).join("; "),
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

export function isHousemateObligationTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith("housemate informed-choice");
}

export { CLIENT_FILE_CARD_TITLE as CLIENT_FILE_TITLES };
