// Staff-duty applicability (DSPD slice 2). Same engine as Step 5 org facts:
// applies | does_not_apply | unanswered. Unknowns stay unanswered and never
// coerce applies=false. Duties are company_obligations.key. Assignments are
// staff_assignments (staff_id, client_id). No extra applicability table,
// no title matching, no invented SEI fact.

import { sowCatalogEntry, sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import {
  obligationFactApplicability,
  type ApplicabilityStatus,
  type OrgFacts,
} from "./applicability.ts";

export const DIRECT_SUPPORT_HIRE_KEYS = [
  "orientation_30_day",
  "cpr_first_aid_initial",
  "cpr_first_aid_renewal",
  "pct_hire_practices",
  "ce_12h_annual",
  "em_bcp_training_annual",
] as const;

export const UNIVERSAL_STAFF_KEYS = [
  "background_screening_annual",
  "medicaid_exclusion_annual",
  "medicaid_disclosure_annual",
  "educational_credentials",
] as const;

export const ABI_DUTY_KEYS = ["abi_training"] as const;
export const TRANSPORT_DUTY_KEYS = ["driving_record_transport"] as const;
export const BEHAVIOR_DUTY_KEYS = ["behavior_intervention_cert"] as const;
export const CLIENT_SCOPED_DUTY_KEYS = ["client_specific_training", "support_strategies"] as const;

const OFFICE_ROLES = new Set(["admin", "program_manager", "committee_member", "super_admin"]);

export type StaffDutyFootprint = "office" | "direct_support" | "unresolved";

export type StaffDutyFacts = {
  staffId: string;
  role: string | null;
  assignmentsKnown: boolean;
  assignedClientIds: string[];
  assignedServiceCodes: string[];
  transportsKnown: boolean;
  isTransporter: boolean;
  abiCaseloadKnown: boolean;
  hasAbiCaseload: boolean;
  requiresAbi: boolean | null;
  behaviorCaseloadKnown: boolean;
  hasBehaviorCaseload: boolean;
  requiresDeescalation: boolean | null;
  managerIdKnown: boolean;
  managerId: string | null;
};

export const UNKNOWN_STAFF_DUTY_FACTS: Omit<StaffDutyFacts, "staffId"> = {
  role: null,
  assignmentsKnown: false,
  assignedClientIds: [],
  assignedServiceCodes: [],
  transportsKnown: false,
  isTransporter: false,
  abiCaseloadKnown: false,
  hasAbiCaseload: false,
  requiresAbi: null,
  behaviorCaseloadKnown: false,
  hasBehaviorCaseload: false,
  requiresDeescalation: null,
  managerIdKnown: false,
  managerId: null,
};

export type DutyApplicability = {
  dutyKey: string;
  status: ApplicabilityStatus;
  applies: boolean;
  unanswered: boolean;
  gap: "none" | "unanswered" | "missing_assignment" | "missing_supervisor";
};

export type DutyGap = {
  staffId: string;
  dutyKey: string;
  kind: "unanswered" | "missing_assignment" | "missing_supervisor" | "evaluation_incomplete";
};

export type ReevaluatePlan = {
  openKeys: string[];
  reuseEvidenceKeys: string[];
  skipOpenKeys: string[];
  gaps: DutyGap[];
};

function row(
  dutyKey: string,
  status: ApplicabilityStatus,
  gap: DutyApplicability["gap"] = "none",
): DutyApplicability {
  return {
    dutyKey,
    status,
    applies: status !== "does_not_apply",
    unanswered: status === "unanswered",
    gap: status === "unanswered" && gap === "none" ? "unanswered" : gap,
  };
}

export function dutyKeyForObligation(ob: {
  key?: string | null;
  title?: string | null;
}): string | null {
  if (ob.key && ob.key.trim()) return ob.key.trim();
  if (ob.title) return sowCatalogEntry(ob.title)?.key ?? null;
  return null;
}

export function isOfficeRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return OFFICE_ROLES.has(role);
}

export function staffDutyFootprint(facts: StaffDutyFacts): StaffDutyFootprint {
  if (!facts.assignmentsKnown) return "unresolved";
  if (facts.assignedClientIds.length > 0) return "direct_support";
  if (isOfficeRole(facts.role)) return "office";
  return "unresolved";
}

function hasKey(list: readonly string[], key: string): boolean {
  return list.includes(key);
}

function codesOverlap(target: string[], have: string[]): boolean {
  if (!target.length) return true;
  const haveUpper = new Set(have.map((c) => c.trim().toUpperCase()).filter(Boolean));
  return target.some((c) => haveUpper.has(c.trim().toUpperCase()));
}

function knownNo(flag: boolean | null, known: boolean, present: boolean): boolean {
  return flag === false && known && !present;
}

export function evaluateStaffDuty(input: {
  dutyKey: string;
  staff: StaffDutyFacts;
  orgFacts?: OrgFacts | null;
  catalogServiceCodes?: string[];
}): DutyApplicability {
  const { dutyKey, staff } = input;
  const catalog = sowCatalogEntryByKey(dutyKey);
  const serviceCodes = input.catalogServiceCodes ?? catalog?.service_codes ?? [];

  const orgFact = input.orgFacts ? obligationFactApplicability(dutyKey, input.orgFacts) : null;
  if (orgFact?.status === "does_not_apply") return row(dutyKey, "does_not_apply");
  if (orgFact?.status === "unanswered") return row(dutyKey, "unanswered");

  if (hasKey(UNIVERSAL_STAFF_KEYS, dutyKey)) return row(dutyKey, "applies");

  if (hasKey(ABI_DUTY_KEYS, dutyKey)) {
    if (staff.hasAbiCaseload || staff.requiresAbi === true) return row(dutyKey, "applies");
    if (knownNo(staff.requiresAbi, staff.abiCaseloadKnown, staff.hasAbiCaseload)) {
      return row(dutyKey, "does_not_apply");
    }
    return row(dutyKey, "unanswered");
  }

  if (hasKey(TRANSPORT_DUTY_KEYS, dutyKey)) {
    if (staff.isTransporter) return row(dutyKey, "applies");
    if (staff.transportsKnown && staff.assignmentsKnown && !staff.isTransporter) {
      return row(dutyKey, "does_not_apply");
    }
    return row(dutyKey, "unanswered");
  }

  if (hasKey(BEHAVIOR_DUTY_KEYS, dutyKey)) {
    if (staff.hasBehaviorCaseload || staff.requiresDeescalation === true) {
      return row(dutyKey, "applies");
    }
    if (
      knownNo(staff.requiresDeescalation, staff.behaviorCaseloadKnown, staff.hasBehaviorCaseload)
    ) {
      return row(dutyKey, "does_not_apply");
    }
    return row(dutyKey, "unanswered");
  }

  if (hasKey(CLIENT_SCOPED_DUTY_KEYS, dutyKey)) {
    if (!staff.assignmentsKnown) return row(dutyKey, "unanswered");
    if (staff.assignedClientIds.length === 0) {
      return row(dutyKey, "unanswered", "missing_assignment");
    }
    return row(dutyKey, "applies");
  }

  const footprint = staffDutyFootprint(staff);

  if (serviceCodes.length > 0) {
    if (!staff.assignmentsKnown) return row(dutyKey, "unanswered");
    if (codesOverlap(serviceCodes, staff.assignedServiceCodes)) {
      if (dutyKey === "acre_sei" && staff.managerIdKnown && !staff.managerId) {
        return row(dutyKey, "applies", "missing_supervisor");
      }
      return row(dutyKey, "applies");
    }
    if (footprint === "office") return row(dutyKey, "does_not_apply");
    if (staff.assignedClientIds.length === 0) {
      return row(dutyKey, "unanswered", "missing_assignment");
    }
    return row(dutyKey, "does_not_apply");
  }

  if (hasKey(DIRECT_SUPPORT_HIRE_KEYS, dutyKey) || catalog?.owner === "staff") {
    if (footprint === "direct_support") return row(dutyKey, "applies");
    if (footprint === "office") return row(dutyKey, "does_not_apply");
    return row(dutyKey, "unanswered", "missing_assignment");
  }

  // Unknown key or unmatched catalog row: never invent applies, never hide as N/A.
  return row(dutyKey, "unanswered");
}

export function evaluateStaffDuties(input: {
  dutyKeys: string[];
  staff: StaffDutyFacts;
  orgFacts?: OrgFacts | null;
}): DutyApplicability[] {
  return input.dutyKeys.map((dutyKey) =>
    evaluateStaffDuty({ dutyKey, staff: input.staff, orgFacts: input.orgFacts }),
  );
}

export function assignmentGapsForStaff(input: {
  staff: StaffDutyFacts;
  duties: DutyApplicability[];
  assignedDutyKeys: Set<string>;
  evaluationComplete: boolean;
}): DutyGap[] {
  if (!input.evaluationComplete) {
    return [
      {
        staffId: input.staff.staffId,
        dutyKey: "*",
        kind: "evaluation_incomplete",
      },
    ];
  }
  const gaps: DutyGap[] = [];
  for (const duty of input.duties) {
    if (duty.status === "does_not_apply") continue;
    if (duty.gap === "missing_supervisor") {
      gaps.push({
        staffId: input.staff.staffId,
        dutyKey: duty.dutyKey,
        kind: "missing_supervisor",
      });
    }
    if (duty.status === "unanswered") {
      gaps.push({
        staffId: input.staff.staffId,
        dutyKey: duty.dutyKey,
        kind: duty.gap === "missing_assignment" ? "missing_assignment" : "unanswered",
      });
      continue;
    }
    if (duty.status === "applies" && !input.assignedDutyKeys.has(duty.dutyKey)) {
      gaps.push({
        staffId: input.staff.staffId,
        dutyKey: duty.dutyKey,
        kind: "missing_assignment",
      });
    }
  }
  return gaps;
}

/** Reevaluation: open newly applicable duties; reuse evidence; never duplicate opens. */
export function planDutyReevaluation(input: {
  staff: StaffDutyFacts;
  duties: DutyApplicability[];
  openDutyKeys: Set<string>;
  evidenceDutyKeys: Set<string>;
  evaluationComplete: boolean;
}): ReevaluatePlan {
  const openKeys: string[] = [];
  const reuseEvidenceKeys: string[] = [];
  const skipOpenKeys: string[] = [];
  for (const duty of input.duties) {
    if (duty.status !== "applies") continue;
    if (input.openDutyKeys.has(duty.dutyKey)) {
      skipOpenKeys.push(duty.dutyKey);
      continue;
    }
    if (input.evidenceDutyKeys.has(duty.dutyKey)) {
      reuseEvidenceKeys.push(duty.dutyKey);
      continue;
    }
    openKeys.push(duty.dutyKey);
  }
  return {
    openKeys,
    reuseEvidenceKeys,
    skipOpenKeys,
    gaps: assignmentGapsForStaff({
      staff: input.staff,
      duties: input.duties,
      assignedDutyKeys: new Set([...input.openDutyKeys, ...input.evidenceDutyKeys]),
      evaluationComplete: input.evaluationComplete,
    }),
  };
}

export function unansweredDutyQuietSummary(
  orgId: string,
  gaps: DutyGap[],
): {
  kind: "quiet_summary";
  id: string;
  title: string;
  body: string;
  count: number;
  urgency: "high";
  dueAt: null;
  source: "assignment_gaps";
} | null {
  const relevant = gaps.filter((g) => g.kind !== "evaluation_incomplete");
  const incomplete = gaps.some((g) => g.kind === "evaluation_incomplete");
  if (relevant.length === 0 && !incomplete) return null;
  const count = incomplete ? Math.max(relevant.length, 1) : relevant.length;
  return {
    kind: "quiet_summary",
    id: `assignment_gaps:${orgId}`,
    title: incomplete ? "Duty evaluation incomplete" : "Assignment gaps",
    body: incomplete
      ? "Assignment or supervisor facts could not be evaluated. This is not a clean compliance result."
      : `${count} requirement${count === 1 ? "" : "s"} need an assignment or an unanswered fact before they can be closed.`,
    count,
    urgency: "high",
    dueAt: null,
    source: "assignment_gaps",
  };
}

export function evaluationIsCompliant(input: {
  evaluationComplete: boolean;
  gaps: DutyGap[];
  failed: boolean;
}): boolean {
  if (input.failed || !input.evaluationComplete) return false;
  return input.gaps.length === 0;
}

/** Packet / list: unanswered stays visible. Never coerce unanswered to N/A. */
export function staffSeesDuty(row: DutyApplicability): boolean {
  return row.status !== "does_not_apply";
}

/** Mint a clock only when the duty is known to apply. */
export function staffReceivesDutyClock(row: DutyApplicability): boolean {
  return row.status === "applies";
}
