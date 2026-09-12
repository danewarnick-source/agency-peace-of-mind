/**
 * Draft-rule simulation. Evaluates Core_Rule_Logic fixtures for synthetic
 * subjects without minting live assignments or claim blocks.
 * Reuses duty applicability + My tasks. Unknown facts → missing-information.
 */

import { addDaysUTC, addYearsUTC, utcDay } from "../../obligation-due-dates.ts";
import { sowCatalogEntryByKey } from "../../sow-obligation-catalog.ts";
import { buildStaffTask, type StaffTask } from "../../staff-my-tasks.ts";
import { allRequiredTopicsComplete } from "../../in-hive-training.ts";
import type { OrgFacts } from "../applicability.ts";
import {
  evaluateStaffDuty,
  staffReceivesDutyClock,
  staffSeesDuty,
  type StaffDutyFacts,
} from "../duty-applicability.ts";
import type { DraftPredicate, DraftRule, GroupMember, TimingAnchor } from "./types.ts";

export type SyntheticStaff = StaffDutyFacts & {
  hireDate: string | null;
  acreCertified: boolean | null;
  supervisorAcreCertified: boolean | null;
};

export type SyntheticEvidence = {
  staffId: string;
  ruleId: string;
  memberId: string;
  completed: boolean;
  completedOn?: string;
  certExpiresOn?: string | null;
  hours?: number;
  courseName?: string;
};

export type SimulationIssueKind =
  | "missing_information"
  | "group_incomplete"
  | "member_incomplete"
  | "expired_certificate";

export type SimulationIssue = {
  kind: SimulationIssueKind;
  ruleId: string;
  memberId?: string;
  message: string;
};

export type MemberSim = {
  memberId: string;
  label: string;
  complete: boolean;
  dueAt: string | null;
  issue: SimulationIssue | null;
};

export type SimulatedRuleResult = {
  ruleId: string;
  title: string;
  applicability: "applies" | "does_not_apply" | "unanswered";
  parentTaskCount: number;
  parentComplete: boolean;
  members: MemberSim[];
  issues: SimulationIssue[];
  task: StaffTask | null;
  dueAt: string | null;
};

export type SimulatedStaffResult = {
  staffId: string;
  rules: SimulatedRuleResult[];
};

export type SimulationResult = {
  wroteDatabase: false;
  createdLiveAssignments: false;
  createdClaimBlocks: false;
  activatedRules: false;
  staff: SimulatedStaffResult[];
};

export type SimulationInput = {
  rules: readonly DraftRule[];
  orgFacts: OrgFacts;
  staff: SyntheticStaff[];
  evidence: SyntheticEvidence[];
  now: Date;
  orgHasAcreCoverage: boolean | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !ISO_DAY.test(value)) return null;
  return new Date(`${value}T00:00:00Z`);
}

function endOfDay(d: Date): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59),
  ).toISOString();
}

/** Hire-anniversary due. Completion date is ignored — it does not reset the window. */
export function employmentYearDue(input: {
  hireDate: string | null;
  startYear: number;
  now: Date;
}): { dueAt: string | null; windowStart: string | null } {
  const hire = parseDay(input.hireDate);
  if (!hire) return { dueAt: null, windowStart: null };
  const startYear = Math.max(1, input.startYear);
  const today = utcDay(input.now);
  let n = startYear;
  let due = addYearsUTC(hire, n);
  while (due.getTime() < today.getTime()) {
    n += 1;
    due = addYearsUTC(hire, n);
  }
  const windowStart = addYearsUTC(hire, n - 1);
  return { dueAt: endOfDay(due), windowStart: isoDay(windowStart) };
}

export function hirePlusDaysDue(hireDate: string | null, days: number): string | null {
  const hire = parseDay(hireDate);
  if (!hire) return null;
  return endOfDay(addDaysUTC(hire, days));
}

function dueFromAnchor(
  anchor: TimingAnchor | undefined,
  staff: SyntheticStaff,
  now: Date,
  evidence: SyntheticEvidence | undefined,
): string | null {
  if (!anchor) return null;
  if (anchor.kind === "none") return null;
  if (anchor.kind === "hire_plus_days") return hirePlusDaysDue(staff.hireDate, anchor.days);
  if (anchor.kind === "employment_year") {
    return employmentYearDue({ hireDate: staff.hireDate, startYear: anchor.startYear, now }).dueAt;
  }
  if (anchor.kind === "certificate_expiry") {
    return evidence?.certExpiresOn ? `${evidence.certExpiresOn}T23:59:59.000Z` : null;
  }
  return null;
}

function evidenceFor(
  list: SyntheticEvidence[],
  staffId: string,
  ruleId: string,
  memberId: string,
): SyntheticEvidence | undefined {
  return list.find((e) => e.staffId === staffId && e.ruleId === ruleId && e.memberId === memberId);
}

function predicateStatus(
  predicate: DraftPredicate,
  staff: SyntheticStaff,
  orgFacts: OrgFacts,
  orgHasAcreCoverage: boolean | null,
): "applies" | "does_not_apply" | "unanswered" {
  if (predicate.kind === "org_acre_coverage") {
    if (orgHasAcreCoverage === null) return "unanswered";
    return orgHasAcreCoverage ? "applies" : "does_not_apply";
  }
  if (predicate.kind === "staff_acre_supervisor") {
    if (!staff.managerIdKnown) return "unanswered";
    if (!staff.managerId) return "unanswered";
    if (staff.supervisorAcreCertified === null) return "unanswered";
    return staff.supervisorAcreCertified ? "applies" : "does_not_apply";
  }
  const catalogKey = predicate.catalogKey;
  if (!catalogKey) return "unanswered";
  const duty = evaluateStaffDuty({ dutyKey: catalogKey, staff, orgFacts });
  return duty.status;
}

function combineApplicability(
  statuses: Array<"applies" | "does_not_apply" | "unanswered">,
): "applies" | "does_not_apply" | "unanswered" {
  if (statuses.some((s) => s === "unanswered")) return "unanswered";
  if (statuses.some((s) => s === "does_not_apply")) return "does_not_apply";
  return "applies";
}

function factMember(
  ruleId: string,
  member: GroupMember,
  known: boolean | null,
  missingLabel: string,
): { complete: boolean; issue: SimulationIssue | null } {
  if (known === null) {
    return {
      complete: false,
      issue: {
        kind: "missing_information",
        ruleId,
        memberId: member.id,
        message: `${missingLabel} is unanswered — missing-information, never auto compliant.`,
      },
    };
  }
  if (!known) {
    return {
      complete: false,
      issue: {
        kind: "member_incomplete",
        ruleId,
        memberId: member.id,
        message: `${member.label} is not met.`,
      },
    };
  }
  return { complete: true, issue: null };
}

function memberComplete(
  rule: DraftRule,
  member: GroupMember,
  ev: SyntheticEvidence | undefined,
  now: Date,
  staff: SyntheticStaff,
  orgHasAcreCoverage: boolean | null,
): { complete: boolean; issue: SimulationIssue | null } {
  if (member.id === "agency-acre-coverage") {
    return factMember(rule.id, member, orgHasAcreCoverage, "Agency ACRE coverage");
  }
  if (member.id === "staff-acre-supervisor") {
    if (!staff.managerIdKnown) {
      return factMember(rule.id, member, null, "SEI supervisor assignment");
    }
    if (!staff.managerId) {
      return {
        complete: false,
        issue: {
          kind: "member_incomplete",
          ruleId: rule.id,
          memberId: member.id,
          message: `${member.label} is not met.`,
        },
      };
    }
    return factMember(
      rule.id,
      member,
      staff.supervisorAcreCertified,
      "Supervisor ACRE certification",
    );
  }
  if (!ev || !ev.completed) {
    return {
      complete: false,
      issue: {
        kind: "member_incomplete",
        ruleId: rule.id,
        memberId: member.id,
        message: `${member.label} is not complete.`,
      },
    };
  }
  const timing = member.timing;
  if (timing?.kind === "certificate_expiry") {
    if (!ev.certExpiresOn) {
      return {
        complete: false,
        issue: {
          kind: "missing_information",
          ruleId: rule.id,
          memberId: member.id,
          message: `${member.label} has no printed expiration — not auto-compliant.`,
        },
      };
    }
    const exp = parseDay(ev.certExpiresOn);
    if (exp && exp.getTime() < utcDay(now).getTime()) {
      return {
        complete: false,
        issue: {
          kind: "expired_certificate",
          ruleId: rule.id,
          memberId: member.id,
          message: `${member.label} expired on ${ev.certExpiresOn}.`,
        },
      };
    }
  }
  if (member.id === "hours-12") {
    const hours = ev.hours ?? 0;
    if (hours < 12) {
      return {
        complete: false,
        issue: {
          kind: "member_incomplete",
          ruleId: rule.id,
          memberId: member.id,
          message: `Employment-year hours are ${hours}; 12 are required.`,
        },
      };
    }
    const window = employmentYearDue({ hireDate: staff.hireDate, startYear: 2, now });
    if (ev.completedOn && window.windowStart && ev.completedOn < window.windowStart) {
      return {
        complete: false,
        issue: {
          kind: "member_incomplete",
          ruleId: rule.id,
          memberId: member.id,
          message: `Hours completed ${ev.completedOn} fall before the current employment-year window (${window.windowStart}). Completion does not reset the anniversary.`,
        },
      };
    }
  }
  return { complete: true, issue: null };
}

function groupComplete(logic: DraftRule["group"]["logic"], members: MemberSim[]): boolean {
  if (members.length === 0) return false;
  if (logic === "ANY") return members.some((m) => m.complete);
  return members.every((m) => m.complete);
}

function parentTask(
  rule: DraftRule,
  staff: SyntheticStaff,
  dueAt: string | null,
  now: Date,
  completedTopics: number,
  totalTopics: number,
  parentComplete: boolean,
): StaffTask | null {
  const key = rule.catalogKeys[0];
  const entry = key ? sowCatalogEntryByKey(key) : null;
  if (!entry) return null;
  const evidenceType =
    rule.completionRoutes.includes("UPLOAD") && !rule.completionRoutes.includes("IN_PLATFORM")
      ? "upload"
      : "attestation";
  return buildStaffTask({
    instanceId: `sim:${rule.id}:${staff.staffId}`,
    title: entry.title,
    source: "sow",
    evidenceType,
    dueAt: dueAt ?? endOfDay(now),
    instanceStatus: parentComplete ? "completed" : "pending",
    courseProgress: totalTopics > 0 ? { completed: completedTopics, total: totalTopics } : null,
    now,
  });
}

function evaluateRuleForStaff(
  rule: DraftRule,
  staff: SyntheticStaff,
  input: SimulationInput,
): SimulatedRuleResult {
  const predStatuses = rule.predicates.map((p) =>
    predicateStatus(p, staff, input.orgFacts, input.orgHasAcreCoverage),
  );
  const applicability = combineApplicability(predStatuses);

  const issues: SimulationIssue[] = [];
  if (applicability === "unanswered") {
    issues.push({
      kind: "missing_information",
      ruleId: rule.id,
      message: `${rule.id} cannot resolve — unknown facts stay missing-information, never auto N/A or compliant.`,
    });
  }

  const members: MemberSim[] = rule.group.members.map((member) => {
    const ev = evidenceFor(input.evidence, staff.staffId, rule.id, member.id);
    const { complete, issue } =
      applicability === "applies"
        ? memberComplete(rule, member, ev, input.now, staff, input.orgHasAcreCoverage)
        : { complete: false, issue: null };
    return {
      memberId: member.id,
      label: member.label,
      complete,
      dueAt: dueFromAnchor(member.timing ?? rule.timing, staff, input.now, ev),
      issue,
    };
  });

  if (applicability === "applies") {
    for (const m of members) {
      if (m.issue) issues.push(m.issue);
    }
  }

  const parentComplete = applicability === "applies" && groupComplete(rule.group.logic, members);
  if (applicability === "applies" && !parentComplete) {
    issues.push({
      kind: "group_incomplete",
      ruleId: rule.id,
      message:
        rule.group.logic === "ANY"
          ? `${rule.id} ANY group has no completed named route.`
          : `${rule.id} ALL group is incomplete — every applicable member is required.`,
    });
  }

  const topicCodes = rule.group.members.map((m) => m.topicCode).filter((c): c is string => !!c);
  const completedTopicSet = new Set(
    rule.group.members
      .filter((m) => m.topicCode && members.find((s) => s.memberId === m.id)?.complete)
      .map((m) => m.topicCode as string),
  );
  const topicsOk =
    topicCodes.length === 0 ? true : allRequiredTopicsComplete(topicCodes, completedTopicSet);

  const dueAt = dueFromAnchor(rule.timing, staff, input.now, undefined);
  const emitTask = applicability === "applies" && rule.group.parentAssignment === "one";
  const task = emitTask
    ? parentTask(
        rule,
        staff,
        dueAt,
        input.now,
        completedTopicSet.size,
        topicCodes.length,
        parentComplete && topicsOk,
      )
    : null;

  return {
    ruleId: rule.id,
    title: rule.title,
    applicability,
    parentTaskCount: emitTask ? 1 : 0,
    parentComplete: parentComplete && topicsOk,
    members,
    issues,
    task,
    dueAt,
  };
}

/**
 * Pure simulation. Callers must not persist the result. The runner never
 * accepts a Supabase client and never writes assignments or claim holds.
 */
export function simulateDraftRules(input: SimulationInput): SimulationResult {
  return {
    wroteDatabase: false,
    createdLiveAssignments: false,
    createdClaimBlocks: false,
    activatedRules: false,
    staff: input.staff.map((staff) => ({
      staffId: staff.staffId,
      rules: input.rules.map((rule) => evaluateRuleForStaff(rule, staff, input)),
    })),
  };
}

export function simulationDutyApplies(
  ruleId: string,
  staff: StaffDutyFacts,
  orgFacts: OrgFacts,
): boolean {
  const catalogByRule: Record<string, string> = {
    "REQ-1.8.4": "orientation_30_day",
    "REQ-1.8.5": "cpr_first_aid_initial",
    "REQ-1.8.7": "ce_12h_annual",
    "REQ-1.8.8": "abi_training",
    "REQ-30.6.b": "acre_sei",
    "REQ-30.6.c": "acre_sei",
  };
  const key = catalogByRule[ruleId];
  if (!key) return false;
  const duty = evaluateStaffDuty({ dutyKey: key, staff, orgFacts });
  return staffReceivesDutyClock(duty);
}

export function simulationDutyVisible(
  ruleId: string,
  staff: StaffDutyFacts,
  orgFacts: OrgFacts,
): boolean {
  const catalogByRule: Record<string, string> = {
    "REQ-1.8.4": "orientation_30_day",
    "REQ-1.8.5": "cpr_first_aid_initial",
    "REQ-1.8.7": "ce_12h_annual",
    "REQ-1.8.8": "abi_training",
    "REQ-30.6.b": "acre_sei",
    "REQ-30.6.c": "acre_sei",
  };
  const key = catalogByRule[ruleId];
  if (!key) return false;
  return staffSeesDuty(evaluateStaffDuty({ dutyKey: key, staff, orgFacts }));
}
