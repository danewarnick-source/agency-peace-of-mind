// Live YES/NO/N/A scoring for the DSPD In-depth Review Tool.
// Types are shared with the UI; the snapshot itself is produced by
// audit-evidence.functions.ts. Mapping from a Person's artifacts onto a
// numbered row lives here so the panel can overlay a per-Person packet
// without a second round-trip.

import type { AuditItem } from "./dspd-audit-tool";

export type AuditVerdict = "yes" | "no" | "na" | "open" | "unknown";

export type AuditEvidenceItem = {
  verdict: AuditVerdict;
  label: string;
  detail?: string;
  href?: string;
};

export type PersonAuditEvidence = {
  client_id: string;
  full_name: string;
  service_codes: string[];
  team_id: string | null;
  team_name: string | null;
  has_abi: boolean;
  grievance_ok: boolean;
  belongings_ok: boolean;
  belongings_on: string | null;
  rnb_ok: boolean;
  lease_ok: boolean;
  support_strategies_ok: boolean | null;
  medical_exam_ok: boolean;
  dental_exam_ok: boolean;
  restriction_ok: boolean | null;
  restriction_detail: string | null;
  summary_ok: boolean | null;
  summary_detail: string | null;
  hhs_billable_ok: boolean | null;
  hhs_blocked: number;
  hhs_present: number;
  loans_ok: boolean | null;
  meds_ok: boolean | null;
};

export type HomeAuditEvidence = {
  team_id: string;
  team_name: string;
  service_code: string;
  client_count: number;
};

export type AuditEvidenceSnapshot = {
  generated_at: string;
  items: Record<string, AuditEvidenceItem>;
  people: PersonAuditEvidence[];
  homes: HomeAuditEvidence[];
};

export const EMPTY_AUDIT_EVIDENCE: AuditEvidenceSnapshot = {
  generated_at: "",
  items: {},
  people: [],
  homes: [],
};

const SUPPORT_STRATEGY_EXCLUDED = new Set([
  "ELS",
  "MTP",
  "PBA",
  "PM1",
  "PM2",
  "RP2",
  "RP3",
  "RP4",
  "RP5",
  "RL6",
  "RPS",
]);

export function personNeedsSupportStrategies(codes: string[]): boolean {
  if (!codes.length) return true;
  return codes.some((c) => !SUPPORT_STRATEGY_EXCLUDED.has(c.toUpperCase()));
}

function yes(label: string, detail?: string, href?: string): AuditEvidenceItem {
  return { verdict: "yes", label, detail, href };
}
function no(label: string, detail?: string, href?: string): AuditEvidenceItem {
  return { verdict: "no", label, detail, href };
}
function na(label: string, detail?: string): AuditEvidenceItem {
  return { verdict: "na", label, detail };
}
function open(label: string, detail?: string, href?: string): AuditEvidenceItem {
  return { verdict: "open", label, detail, href };
}

/** Live score for one Person on one Part II row. Null = no Person-level artifact. */
export function personVerdictForItem(
  item: AuditItem,
  person: PersonAuditEvidence,
): AuditEvidenceItem | null {
  const href = item.hive_href
    ? `${item.hive_href}${item.hive_href.includes("?") ? "&" : "?"}client=${person.client_id}`
    : `/dashboard/clients/${person.client_id}`;

  switch (item.id) {
    case "II-1": {
      const bits: string[] = [];
      if (person.medical_exam_ok) bits.push("medical exam on file");
      else bits.push("no medical exam");
      if (person.dental_exam_ok) bits.push("dental exam on file");
      else bits.push("no dental exam");
      const ok = person.medical_exam_ok && person.dental_exam_ok;
      return ok
        ? yes("Exams on file", bits.join("; "), href)
        : no("Missing exam record", bits.join("; "), href);
    }
    case "II-2":
      if (person.meds_ok === null) return na("N/A — no medications on file");
      return person.meds_ok
        ? yes("Medication record in eMAR", undefined, "/dashboard/emar")
        : no("Medication support with no record", undefined, "/dashboard/emar");
    case "II-3":
      if (person.support_strategies_ok === null) {
        return na("N/A — Support Strategies not required for this Person's codes");
      }
      return person.support_strategies_ok
        ? yes("Support Strategies completed", undefined, href)
        : open("Support Strategies not completed", undefined, href);
    case "II-6":
      if (person.summary_ok === null) {
        return open("No summary period on file yet", undefined, "/dashboard/summaries");
      }
      return person.summary_ok
        ? yes(
            "Current summary finalized",
            person.summary_detail ?? undefined,
            "/dashboard/summaries",
          )
        : no(
            "Summary overdue or incomplete",
            person.summary_detail ?? undefined,
            "/dashboard/summaries",
          );
    case "II-7":
      return person.grievance_ok
        ? yes("Grievance policy acknowledged", undefined, href)
        : no("No signed grievance acknowledgment", undefined, href);
    case "II-8":
      if (person.restriction_ok === null) return na("N/A — no active rights restriction");
      return person.restriction_ok
        ? yes("Eight restriction elements complete", person.restriction_detail ?? undefined, href)
        : no("Restriction missing required elements", person.restriction_detail ?? undefined, href);
    case "II-9":
      return person.belongings_ok
        ? yes(
            "Belongings inventoried within 12 months",
            person.belongings_on ? `Last inventory ${person.belongings_on}` : undefined,
            href,
          )
        : no(
            "Belongings inventory missing or older than 12 months",
            person.belongings_on
              ? `Last inventory ${person.belongings_on}`
              : "No inventory on file",
            href,
          );
    case "II-10-HHS":
      return person.rnb_ok
        ? yes("Room-and-board agreement on file", undefined, href)
        : no("No room-and-board agreement", undefined, href);
    case "II-10-RHS":
      return person.lease_ok
        ? yes("Lease on file", undefined, href)
        : no("No lease agreement", undefined, href);
    case "II-10-PPS":
      return person.rnb_ok
        ? yes("Room-and-board agreement on file", undefined, href)
        : no("No room-and-board agreement", undefined, href);
    case "II-LOAN":
      if (person.loans_ok === null) return na("N/A — no loans");
      return person.loans_ok
        ? yes("Loan record on file", undefined, "/dashboard/client-loans")
        : open(
            "Loan on file — confirm SC notice and accounting",
            undefined,
            "/dashboard/client-loans",
          );
    case "III-HHS":
      if (person.hhs_billable_ok === null) return na("N/A — no HHS days in the last 30");
      return person.hhs_billable_ok
        ? yes(
            "HHS days billable",
            `${person.hhs_present} present day${person.hhs_present === 1 ? "" : "s"} in the last 30`,
            href,
          )
        : no(
            "Unbillable HHS days",
            `${person.hhs_blocked} blocked of ${person.hhs_present + person.hhs_blocked} in the last 30`,
            href,
          );
    default:
      return null;
  }
}

export function toneFromVerdict(
  verdict: AuditVerdict,
): "na" | "overdue" | "open" | "met" | "hive" | "gap" {
  switch (verdict) {
    case "yes":
      return "met";
    case "no":
      return "overdue";
    case "open":
      return "open";
    case "na":
      return "na";
    default:
      return "gap";
  }
}
