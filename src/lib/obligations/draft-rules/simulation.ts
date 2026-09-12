/**
 * Draft-rule simulation. Evaluates Core_Rule_Logic fixtures for synthetic
 * subjects without minting live assignments or claim blocks.
 * Reuses duty applicability + My tasks. Unknown facts → missing-information.
 */

import { addDaysUTC, addMonthsUTC, addYearsUTC, utcDay } from "../../obligation-due-dates.ts";
import { sowCatalogEntryByKey } from "../../sow-obligation-catalog.ts";
import { buildStaffTask, type StaffTask } from "../../staff-my-tasks.ts";
import { allRequiredTopicsComplete } from "../../in-hive-training.ts";
import type { OrgFacts } from "../applicability.ts";
import { awardedCodesUnanswered } from "../setup-facts.ts";
import {
  evaluateStaffDuty,
  staffDutyFootprint,
  staffReceivesDutyClock,
  staffSeesDuty,
  type StaffDutyFacts,
} from "../duty-applicability.ts";
import {
  PERIODIC_MONTHLY_CODES,
  PERIODIC_QUARTERLY_CODES,
} from "./fixtures.ts";
import type {
  CompletionRoute,
  DraftPredicate,
  DraftRule,
  GroupMember,
  MemberCondition,
  NestedRoute,
  TimingAnchor,
} from "./types.ts";

export type SyntheticStaff = StaffDutyFacts & {
  hireDate: string | null;
  acreCertified: boolean | null;
  supervisorAcreCertified: boolean | null;
  /** REQ-30.5: designated benefits person. Null / omitted = unanswered. */
  isBenefitsDesignated?: boolean | null;
  benefitsQualified?: boolean | null;
  /** REQ-1.8.6: risk appeared after the original assignment window. */
  behaviorRiskNewlyArisen?: boolean | null;
  /** REQ-33.5(c): Customized Employment only if Discovery. */
  sjdPerformsDiscovery?: boolean | null;
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
  isOfficialProgram?: boolean;
  isGenericQuiz?: boolean;
  selectedRouteId?: string;
  writtenDspdApproval?: boolean;
  reviewedForNewRisk?: boolean;
  route?: CompletionRoute;
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
  applicable: boolean;
  selectedRouteId?: string;
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
  /** REQ-30.6.a cohort. Null / omitted = unanswered — never invent the live-UI fallback. */
  seiAwardDate?: string | null;
  usorOfficialProofOnFile?: boolean | null;
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

/** Cohort due. Unknown award date is unanswered — never invent a fallback. */
export function usorCohortDue(input: {
  awardDate: string | null;
  cutover: string;
  existingDeadline: string;
  awardPlusMonths: number;
}): { dueAt: string | null; cohort: "existing" | "new_award" | null } {
  const award = parseDay(input.awardDate);
  if (!award) return { dueAt: null, cohort: null };
  if (input.awardDate! < input.cutover) {
    const existing = parseDay(input.existingDeadline);
    return { dueAt: existing ? endOfDay(existing) : null, cohort: "existing" };
  }
  return {
    dueAt: endOfDay(addMonthsUTC(award, input.awardPlusMonths)),
    cohort: "new_award",
  };
}

export function countQualifiedDesignatedBenefits(staff: readonly SyntheticStaff[]): {
  designated: number;
  qualified: number;
  unknown: number;
  satisfies: boolean | null;
} {
  let designated = 0;
  let qualified = 0;
  let unknown = 0;
  for (const person of staff) {
    if (person.isBenefitsDesignated == null) {
      unknown += 1;
      continue;
    }
    if (!person.isBenefitsDesignated) continue;
    designated += 1;
    if (person.benefitsQualified == null) unknown += 1;
    else if (person.benefitsQualified) qualified += 1;
  }
  if (qualified >= 1) return { designated, qualified, unknown, satisfies: true };
  if (unknown > 0) return { designated, qualified, unknown, satisfies: null };
  return { designated, qualified, unknown, satisfies: false };
}

const GENERIC_QUIZ = /generic\s+quiz|in-platform quiz|hive quiz/i;
const OFFICIAL_BEHAVIOR = ["soar", "mandt", "part", "cpi", "safety care", "safety-care"];

function looksLikeGenericQuiz(ev: SyntheticEvidence | undefined): boolean {
  if (!ev) return false;
  if (ev.isGenericQuiz === true) return true;
  return !!ev.courseName && GENERIC_QUIZ.test(ev.courseName);
}

function officialProgramAccepted(ev: SyntheticEvidence | undefined, officialName?: string): boolean {
  if (!ev || !ev.completed) return false;
  if (looksLikeGenericQuiz(ev)) return false;
  if (ev.isOfficialProgram === false) return false;
  if (ev.isOfficialProgram === true) return true;
  if (!ev.courseName || !officialName) return false;
  const have = ev.courseName.toLowerCase();
  const want = officialName.toLowerCase();
  if (have.includes(want)) return true;
  return OFFICIAL_BEHAVIOR.some((p) => want.includes(p) && have.includes(p));
}

function codesOverlapSet(have: readonly string[], target: readonly string[]): boolean {
  const upper = new Set(have.map((c) => c.trim().toUpperCase()).filter(Boolean));
  return target.some((c) => upper.has(c));
}

function dueFromAnchor(
  anchor: TimingAnchor | undefined,
  staff: SyntheticStaff,
  now: Date,
  evidence: SyntheticEvidence | undefined,
  seiAwardDate: string | null = null,
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
  if (anchor.kind === "usor_cohort") {
    return usorCohortDue({
      awardDate: seiAwardDate,
      cutover: anchor.cutover,
      existingDeadline: anchor.existingDeadline,
      awardPlusMonths: anchor.awardPlusMonths,
    }).dueAt;
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
  seiAwardDate: string | null,
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
  if (predicate.kind === "designated_benefits_staff") {
    if (staff.isBenefitsDesignated == null) return "unanswered";
    return staff.isBenefitsDesignated ? "applies" : "does_not_apply";
  }
  if (predicate.kind === "usor_sei_vendor") {
    if (awardedCodesUnanswered(orgFacts.servicesOffered)) return "unanswered";
    const hasSei = (orgFacts.servicesOffered ?? []).some((c) => c.trim().toUpperCase() === "SEI");
    if (!hasSei) return "does_not_apply";
    if (!seiAwardDate) return "unanswered";
    return "applies";
  }
  if (predicate.kind === "periodic_report") {
    if (!staff.assignmentsKnown) return "unanswered";
    const codes = staff.assignedServiceCodes;
    if (codes.length === 0) {
      return staffDutyFootprint(staff) === "office" ? "does_not_apply" : "unanswered";
    }
    const hasMonthly = codesOverlapSet(codes, PERIODIC_MONTHLY_CODES);
    const hasQuarterly = codesOverlapSet(codes, PERIODIC_QUARTERLY_CODES);
    return hasMonthly || hasQuarterly ? "applies" : "does_not_apply";
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

function memberConditionKnown(
  condition: MemberCondition | undefined,
  staff: SyntheticStaff,
): { applicable: boolean; unanswered: boolean } {
  if (!condition) return { applicable: true, unanswered: false };
  if (condition === "newly_arising_risk") {
    if (staff.behaviorRiskNewlyArisen == null) return { applicable: true, unanswered: true };
    return { applicable: staff.behaviorRiskNewlyArisen, unanswered: false };
  }
  if (condition === "sjd_discovery") {
    if (staff.sjdPerformsDiscovery == null) return { applicable: true, unanswered: true };
    return { applicable: staff.sjdPerformsDiscovery, unanswered: false };
  }
  if (condition === "monthly_summary_codes") {
    return {
      applicable: codesOverlapSet(staff.assignedServiceCodes, PERIODIC_MONTHLY_CODES),
      unanswered: !staff.assignmentsKnown,
    };
  }
  if (condition === "quarterly_summary_codes") {
    return {
      applicable: codesOverlapSet(staff.assignedServiceCodes, PERIODIC_QUARTERLY_CODES),
      unanswered: !staff.assignmentsKnown,
    };
  }
  return { applicable: true, unanswered: false };
}

function genericQuizIssue(ruleId: string, member: GroupMember): SimulationIssue {
  return {
    kind: "member_incomplete",
    ruleId,
    memberId: member.id,
    message: `A generic quiz cannot replace ${member.label}. Default handling is not equivalency.`,
  };
}

function memberComplete(
  rule: DraftRule,
  member: GroupMember,
  ev: SyntheticEvidence | undefined,
  now: Date,
  staff: SyntheticStaff,
  orgHasAcreCoverage: boolean | null,
  usorOfficialProofOnFile: boolean | null,
  allEvidence: SyntheticEvidence[],
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
  if (member.id === "qualified-designated") {
    return factMember(rule.id, member, staff.benefitsQualified ?? null, "Designated staff qualification");
  }
  if (member.id === "official-usor-proof") {
    if (usorOfficialProofOnFile === true || ev?.completed) {
      if (looksLikeGenericQuiz(ev)) return { complete: false, issue: genericQuizIssue(rule.id, member) };
      return { complete: true, issue: null };
    }
    if (usorOfficialProofOnFile === null && !ev) {
      return factMember(rule.id, member, null, "Official USOR vendor proof");
    }
    return {
      complete: false,
      issue: {
        kind: "member_incomplete",
        ruleId: rule.id,
        memberId: member.id,
        message: `${member.label} is not on file.`,
      },
    };
  }
  if (member.id === "newly-arising-review") {
    if (staff.behaviorRiskNewlyArisen == null) {
      return factMember(rule.id, member, null, "Newly arising risk");
    }
    if (!staff.behaviorRiskNewlyArisen) return { complete: true, issue: null };
    if (ev?.reviewedForNewRisk || ev?.completed) return { complete: true, issue: null };
    return {
      complete: false,
      issue: {
        kind: "member_incomplete",
        ruleId: rule.id,
        memberId: member.id,
        message: "Newly arising risk requires review.",
      },
    };
  }
  if (member.id === "sjd-supervision-pending") {
    const acreEv = evidenceFor(allEvidence, staff.staffId, rule.id, "sjd-acre");
    const acreDone =
      staff.acreCertified === true ||
      (acreEv?.completed === true && !looksLikeGenericQuiz(acreEv));
    if (acreDone) return { complete: true, issue: null };
    if (staff.supervisorAcreCertified === null) {
      return factMember(rule.id, member, null, "Qualified ACRE supervision while pending");
    }
    if (!staff.supervisorAcreCertified) {
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
    const grace = hirePlusDaysDue(staff.hireDate, 60);
    const graceEnded = grace ? new Date(grace).getTime() < now.getTime() : false;
    if (graceEnded && !acreDone) {
      return {
        complete: false,
        issue: {
          kind: "member_incomplete",
          ruleId: rule.id,
          memberId: member.id,
          message: "ACRE grace (hire+60) has ended; pending supervision is not enough.",
        },
      };
    }
    return { complete: true, issue: null };
  }
  if (member.id === "alt-dspd-approval") {
    if (ev?.writtenDspdApproval === true) return { complete: true, issue: null };
    if (ev?.writtenDspdApproval === false || ev?.completed === false) {
      return {
        complete: false,
        issue: {
          kind: "member_incomplete",
          ruleId: rule.id,
          memberId: member.id,
          message: "Prior written DSPD approval is required for the alternative program.",
        },
      };
    }
    if (!ev) {
      return factMember(rule.id, member, null, "Prior written DSPD approval");
    }
    return ev.writtenDspdApproval
      ? { complete: true, issue: null }
      : {
          complete: false,
          issue: {
            kind: "member_incomplete",
            ruleId: rule.id,
            memberId: member.id,
            message: "Prior written DSPD approval is required for the alternative program.",
          },
        };
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
  if (looksLikeGenericQuiz(ev) && (member.requiresOfficialProgram || member.id === "cpr" || member.id === "first_aid")) {
    return { complete: false, issue: genericQuizIssue(rule.id, member) };
  }
  if (member.requiresOfficialProgram && ev.isOfficialProgram === false) {
    return { complete: false, issue: genericQuizIssue(rule.id, member) };
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
  const applicable = members.filter((m) => m.applicable);
  if (applicable.length === 0) {
    return members.length > 0 && members.every((m) => !m.applicable);
  }
  if (logic === "ANY") return applicable.some((m) => m.complete);
  return applicable.every((m) => m.complete);
}

function evaluateRoute(
  rule: DraftRule,
  route: NestedRoute,
  staff: SyntheticStaff,
  input: SimulationInput,
): { complete: boolean; issues: SimulationIssue[]; members: MemberSim[] } {
  const routeEv = evidenceFor(input.evidence, staff.staffId, rule.id, route.id);
  const conditionMembers: MemberSim[] = route.conditions.map((member) => {
    const ev = evidenceFor(input.evidence, staff.staffId, rule.id, member.id) ?? routeEv;
    const { complete, issue } = memberComplete(
      rule,
      member,
      ev,
      input.now,
      staff,
      input.orgHasAcreCoverage,
      input.usorOfficialProofOnFile ?? null,
      input.evidence,
    );
    return {
      memberId: member.id,
      label: member.label,
      complete,
      dueAt: dueFromAnchor(member.timing ?? rule.timing, staff, input.now, ev, input.seiAwardDate),
      issue,
      applicable: true,
      selectedRouteId: route.id,
    };
  });
  if (looksLikeGenericQuiz(routeEv)) {
    return {
      complete: false,
      issues: [genericQuizIssue(rule.id, { ...route.conditions[0]!, id: route.id, label: route.label })],
      members: conditionMembers,
    };
  }
  if (routeEv && officialProgramAccepted(routeEv, route.officialProgram) === false && routeEv.completed) {
    if (routeEv.isOfficialProgram !== true && looksLikeGenericQuiz(routeEv)) {
      return {
        complete: false,
        issues: [genericQuizIssue(rule.id, { ...route.conditions[0]!, id: route.id, label: route.label })],
        members: conditionMembers,
      };
    }
  }
  const complete = conditionMembers.length > 0 && conditionMembers.every((m) => m.complete);
  return {
    complete,
    issues: conditionMembers.map((m) => m.issue).filter((i): i is SimulationIssue => i !== null),
    members: conditionMembers,
  };
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
  const title = entry?.title ?? rule.title;
  const evidenceType =
    rule.completionRoutes.includes("UPLOAD") && !rule.completionRoutes.includes("IN_PLATFORM")
      ? "upload"
      : "attestation";
  return buildStaffTask({
    instanceId: `sim:${rule.id}:${staff.staffId}`,
    title,
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
    predicateStatus(p, staff, input.orgFacts, input.orgHasAcreCoverage, input.seiAwardDate),
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
    const cond = memberConditionKnown(member.condition, staff);
    if (applicability !== "applies") {
      return {
        memberId: member.id,
        label: member.label,
        complete: false,
        dueAt: dueFromAnchor(member.timing ?? rule.timing, staff, input.now, ev, input.seiAwardDate),
        issue: null,
        applicable: cond.applicable,
      };
    }
    if (cond.unanswered) {
      const issue: SimulationIssue = {
        kind: "missing_information",
        ruleId: rule.id,
        memberId: member.id,
        message: `${member.label} cannot resolve — unknown facts stay missing-information, never auto N/A or compliant.`,
      };
      return {
        memberId: member.id,
        label: member.label,
        complete: false,
        dueAt: dueFromAnchor(member.timing ?? rule.timing, staff, input.now, ev, input.seiAwardDate),
        issue,
        applicable: true,
      };
    }
    if (!cond.applicable) {
      return {
        memberId: member.id,
        label: member.label,
        complete: false,
        dueAt: null,
        issue: null,
        applicable: false,
      };
    }
    const { complete, issue } = memberComplete(
      rule,
      member,
      ev,
      input.now,
      staff,
      input.orgHasAcreCoverage,
      input.usorOfficialProofOnFile ?? null,
      input.evidence,
    );
    return {
      memberId: member.id,
      label: member.label,
      complete,
      dueAt: dueFromAnchor(member.timing ?? rule.timing, staff, input.now, ev, input.seiAwardDate),
      issue,
      applicable: true,
    };
  });

  const routeResults = (rule.group.routes ?? []).map((route) =>
    evaluateRoute(rule, route, staff, input),
  );
  const selectedRoute = routeResults.find((r) => r.complete);
  const routesOk =
    !rule.group.routes || rule.group.routes.length === 0
      ? true
      : applicability === "applies" && routeResults.some((r) => r.complete);

  if (selectedRoute) members.push(...selectedRoute.members);
  else if (applicability === "applies" && rule.group.routes && rule.group.routes.length > 0) {
    const selectedId = input.evidence.find(
      (e) => e.staffId === staff.staffId && e.ruleId === rule.id && e.selectedRouteId,
    )?.selectedRouteId;
    const attempted = routeResults.find((r) =>
      r.members.some((m) => m.selectedRouteId === selectedId),
    );
    if (attempted) members.push(...attempted.members);
  }

  if (applicability === "applies") {
    for (const m of members) {
      if (m.applicable && m.issue) issues.push(m.issue);
    }
  }

  const membersOk = groupComplete(rule.group.logic, members.filter((m) => !m.selectedRouteId));
  const parentComplete = applicability === "applies" && membersOk && routesOk;
  if (applicability === "applies" && !parentComplete) {
    issues.push({
      kind: "group_incomplete",
      ruleId: rule.id,
      message:
        rule.group.routes && rule.group.routes.length > 0 && !routesOk
          ? `${rule.id} has no approved complete route. The selected route must satisfy ALL of its conditions.`
          : rule.group.logic === "ANY"
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

  const dueAt = dueFromAnchor(rule.timing, staff, input.now, undefined, input.seiAwardDate ?? null);
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
    "REQ-1.8.6": "behavior_intervention_cert",
    "REQ-32.5": "cmp_cms_caregiver_comp",
    "REQ-33.5.b-c": "acre_sjd",
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
    "REQ-1.8.6": "behavior_intervention_cert",
    "REQ-32.5": "cmp_cms_caregiver_comp",
    "REQ-33.5.b-c": "acre_sjd",
  };
  const key = catalogByRule[ruleId];
  if (!key) return false;
  return staffSeesDuty(evaluateStaffDuty({ dutyKey: key, staff, orgFacts }));
}
