// This Week decisions — rollup, decoration, human due dates, QuietLine.
// getThisWeek (I/O) lives in this-week.functions.ts and calls these first.

import { addDaysYmd, daysBetweenYmd, denverYmd } from "../admin-home-data.ts";
import {
  auditRefForObligationKey,
  type EscalationHit,
  type EscalationTrigger,
  type EscalationUrgency,
} from "./escalation.ts";
import type { RemediationPlanKind } from "./remediation.ts";
import { isBlocksSoloWhenLapsedKey } from "./solo-lapse.ts";
import type { AlreadyAssignedStrip, AutomationHeartbeat } from "./already-assigned.ts";
export type { AlreadyAssignedStrip, AutomationHeartbeat } from "./already-assigned.ts";

/** Review-tool Part + line. Kept here so this-week tests do not load dspd-audit-tool. */
const IF_MISSED_BY_KEY: Record<string, string> = {
  person_discharge_process: "Part I.9 finding",
  conflict_of_interest_process: "Part I.8 finding",
  hhs_home_cert_annual: "Part I.2 finding",
  hhs_inspection: "Part I.2 finding",
  ce_12h_annual: "Part IV.9 finding",
  cpr_first_aid_initial: "Part IV.7 finding",
  cpr_first_aid_renewal: "Part IV.7 finding",
  medicaid_manuals_memo: "Part I finding",
};

export type DecisionActionKind = "log_renewal" | "read_and_sign" | "log_plan" | "approve_plan";

export type DecisionAction = {
  label: string;
  kind: DecisionActionKind;
};

export type Decision = {
  kind: "decision";
  id: string;
  title: string;
  body: string;
  urgency: EscalationUrgency;
  dueAt: string | null;
  ownerUserId: string | null;
  ownerLabel: string;
  consequence: string;
  source: "remediation_plan" | "escalation" | "standing_missing" | "nectar_proposed";
  trigger?: EscalationHit["trigger"];
  instanceId?: string | null;
  obligationId?: string | null;
  obligationKey?: string | null;
  subjectName?: string | null;
  planId?: string | null;
  planKind?: RemediationPlanKind | null;
  staffUserId?: string | null;
  overridden?: boolean;
  overrideUntil?: string | null;
  mergedTriggers?: EscalationTrigger[];
  count?: number;
  headline?: string;
  why?: string;
  ownerText?: string;
  dueText?: string;
  ifMissed?: string;
  action?: DecisionAction;
};

export type QuietSummary = {
  kind: "quiet_summary";
  id: string;
  title: string;
  body: string;
  count: number;
  urgency: EscalationUrgency;
  dueAt: string | null;
  source: "evv_needs_review" | "org_profile_facts" | "assignment_gaps";
};

export type ThisWeekItem = Decision | QuietSummary;

export type QuietLine = {
  kind: "quiet_line";
  obligationsSatisfied: number;
  notesPassed: number;
  notesTotal: number;
  standingCurrent: number;
  recordsReviewCleared: number;
  evvReconciledThrough: string | null;
  segments: string[];
  assignmentGaps?: number;
  unansweredFacts?: number;
  evaluationIncomplete?: boolean;
  checkFailed?: boolean;
};

export type ThisWeekResult = {
  items: Decision[];
  quiet: QuietLine;
  alreadyAssigned: AlreadyAssignedStrip;
  automation: AutomationHeartbeat;
};

export type DecorateDecisionCtx = {
  now?: Date;
  viewerUserId?: string | null;
};

export const HEADLINE_VERB_RE =
  /^(Renew|Sign off|Sign|Get|Close|Start|Read and sign|Approve|Decide|Match|Answer|Book|Send)\b/;

export const FORBIDDEN_DECISION_STRINGS = [
  "§",
  "DHHS91172",
  "licensing or repayment item",
  "corrective action plan or repayment demand",
  "not just a note on file",
] as const;

const URGENCY_ORDER: Record<EscalationUrgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function emptyQuietLine(): QuietLine {
  return {
    kind: "quiet_line",
    obligationsSatisfied: 0,
    notesPassed: 0,
    notesTotal: 0,
    standingCurrent: 0,
    recordsReviewCleared: 0,
    evvReconciledThrough: null,
    segments: [],
    assignmentGaps: 0,
    unansweredFacts: 0,
    evaluationIncomplete: false,
    checkFailed: false,
  };
}

export function buildQuietLine(counts: {
  obligationsSatisfied?: number;
  notesPassed?: number;
  notesTotal?: number;
  standingCurrent?: number;
  recordsReviewCleared?: number;
  evvReconciledThrough?: string | null;
  assignmentGaps?: number;
  unansweredFacts?: number;
  evaluationIncomplete?: boolean;
  checkFailed?: boolean;
}): QuietLine {
  const obligationsSatisfied = Math.max(0, counts.obligationsSatisfied ?? 0);
  const notesPassed = Math.max(0, counts.notesPassed ?? 0);
  const notesTotal = Math.max(0, counts.notesTotal ?? 0);
  const standingCurrent = Math.max(0, counts.standingCurrent ?? 0);
  const recordsReviewCleared = Math.max(0, counts.recordsReviewCleared ?? 0);
  const evvReconciledThrough = counts.evvReconciledThrough ?? null;
  const assignmentGaps = Math.max(0, counts.assignmentGaps ?? 0);
  const unansweredFacts = Math.max(0, counts.unansweredFacts ?? 0);
  const evaluationIncomplete = counts.evaluationIncomplete === true;
  const checkFailed = counts.checkFailed === true;
  const segments: string[] = [];
  if (evaluationIncomplete || checkFailed) {
    segments.push(
      checkFailed && !evaluationIncomplete
        ? "A live check did not finish — this is not a clean compliance result"
        : "Duty evaluation incomplete — this is not a clean compliance result",
    );
  } else if (assignmentGaps > 0) {
    segments.push(
      `${assignmentGaps} assignment gap${assignmentGaps === 1 ? "" : "s"} still open — not a clean compliance result`,
    );
  }
  if (unansweredFacts > 0 && !evaluationIncomplete && !checkFailed) {
    segments.push(
      `${unansweredFacts} compliance setup fact${unansweredFacts === 1 ? "" : "s"} unanswered — not a clean compliance result`,
    );
  }
  if (obligationsSatisfied > 0) {
    segments.push(
      `${obligationsSatisfied} obligation${obligationsSatisfied === 1 ? "" : "s"} satisfied by normal operations`,
    );
  }
  if (notesTotal > 0) {
    segments.push(`${notesPassed} of ${notesTotal} notes passed Nectar`);
  }
  if (standingCurrent > 0) {
    segments.push(`${standingCurrent} standing record${standingCurrent === 1 ? "" : "s"} current`);
  }
  if (recordsReviewCleared > 0) {
    segments.push(
      `${recordsReviewCleared} records-review item${recordsReviewCleared === 1 ? "" : "s"} cleared`,
    );
  }
  if (evvReconciledThrough) {
    segments.push(`EVV reconciled through ${evvReconciledThrough}`);
  }
  return {
    kind: "quiet_line",
    obligationsSatisfied,
    notesPassed,
    notesTotal,
    standingCurrent,
    recordsReviewCleared,
    evvReconciledThrough,
    segments,
    assignmentGaps,
    unansweredFacts,
    evaluationIncomplete,
    checkFailed,
  };
}

export function quietLineIsClean(quiet: QuietLine): boolean {
  if (quiet.evaluationIncomplete || quiet.checkFailed) return false;
  if ((quiet.assignmentGaps ?? 0) > 0) return false;
  if ((quiet.unansweredFacts ?? 0) > 0) return false;
  return !quiet.segments.some((s) => /not a clean compliance result/.test(s));
}

export function formatQuietLine(quiet: QuietLine): string {
  if (!quietLineIsClean(quiet)) {
    const body =
      quiet.segments.length > 0
        ? quiet.segments.join(" · ")
        : "this is not a clean compliance result";
    return `Needs an answer: ${body}`;
  }
  if (quiet.segments.length === 0) return "Handled without you: operations are current.";
  return `Handled without you: ${quiet.segments.join(" · ")}`;
}

export function thisWeekStatusLine(input: {
  loading?: boolean;
  failed?: boolean;
  itemCount: number;
  quiet: QuietLine;
}): string {
  if (input.loading) return "Loading decisions.";
  if (input.failed) return "Could not load this week.";
  if (!quietLineIsClean(input.quiet) && input.itemCount === 0) {
    if (input.quiet.evaluationIncomplete || input.quiet.checkFailed) {
      return "Duty evaluation or a live check did not finish. This is not a clean compliance result.";
    }
    if ((input.quiet.unansweredFacts ?? 0) > 0) {
      return "Compliance setup facts still need an answer.";
    }
    return "Assignment gaps are still open. This is not a clean compliance result.";
  }
  if (input.itemCount === 0) return "Nothing needs you this week.";
  const n = input.itemCount;
  const word = n === 1 ? "One" : n === 2 ? "Two" : n === 3 ? "Three" : String(n);
  return `${word} decision${n === 1 ? "" : "s"}. Everything else is delegated and quiet.`;
}

export function decisionFromQuietSummary(summary: QuietSummary, ownerUserId: string): Decision {
  return {
    kind: "decision",
    id: summary.id,
    title: summary.title,
    body: summary.body,
    urgency: summary.urgency,
    dueAt: summary.dueAt,
    ownerUserId,
    ownerLabel: "admin_level",
    consequence:
      summary.source === "org_profile_facts"
        ? "Unanswered setup facts keep conditional duties visible until they are recorded."
        : "Missing assignments and unanswered duty facts are gaps, not a clean result.",
    source: "standing_missing",
    count: summary.count,
  };
}

export function sortThisWeekItems<T extends { urgency: EscalationUrgency; dueAt: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (u !== 0) return u;
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}

function urgencyRank(u: EscalationUrgency): number {
  return URGENCY_ORDER[u];
}

function soonerDue(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function instanceKey(d: Decision): string | null {
  if (d.instanceId) return `inst:${d.instanceId}`;
  return null;
}

function summaryKey(d: Decision): string | null {
  if (d.instanceId) return null;
  if (d.obligationKey) return `key:${d.obligationKey}`;
  if (d.obligationId) return `ob:${d.obligationId}`;
  return null;
}

function mergeDecisionGroup(group: Decision[]): Decision {
  const plan = group.find((d) => d.source === "remediation_plan" && d.planId);
  const base =
    plan ?? group.slice().sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency))[0]!;
  const triggers = new Set<EscalationTrigger>();
  for (const d of group) {
    if (d.trigger) triggers.add(d.trigger);
    for (const t of d.mergedTriggers ?? []) triggers.add(t);
  }
  let urgency = base.urgency;
  let dueAt = base.dueAt;
  for (const d of group) {
    if (urgencyRank(d.urgency) < urgencyRank(urgency)) urgency = d.urgency;
    dueAt = soonerDue(dueAt, d.dueAt);
  }
  const count = group.reduce((n, d) => n + (d.count && d.count > 0 ? d.count : 1), 0);
  return {
    ...base,
    urgency,
    dueAt,
    mergedTriggers: [...triggers],
    count,
    trigger: base.trigger ?? group.find((d) => d.trigger)?.trigger,
  };
}

function isUnplannedLicense(d: Decision): boolean {
  if (d.planId) return false;
  return isLicenseDecision(d);
}

/** Same-type license renewals share a key even across distinct instanceIds. */
export function licenseTypeKey(d: Decision): string | null {
  if (!isUnplannedLicense(d)) return null;
  const key = (d.obligationKey ?? "").trim();
  if (key.startsWith("ol_")) return "lic:ol_family";
  if (key) return `lic:${key}`;
  const title = shortTitle(d.title).toLowerCase();
  if (/\bol\b/.test(title)) return "lic:ol_family";
  return title ? `lic-title:${title}` : "lic:other";
}

function mergeLicenseGroup(group: Decision[]): Decision {
  const merged = mergeDecisionGroup(group);
  const keys = new Set(group.map((d) => (d.obligationKey ?? "").trim()).filter(Boolean));
  const titles = new Set(group.map((d) => shortTitle(d.title)));
  if (keys.size > 1 || titles.size > 1) {
    return { ...merged, obligationKey: null, title: "overdue licenses" };
  }
  return merged;
}

function rollupLicenseTypes(items: Decision[]): Decision[] {
  const byType = new Map<string, Decision[]>();
  const rest: Decision[] = [];
  for (const item of items) {
    const key = licenseTypeKey(item);
    if (!key) {
      rest.push(item);
      continue;
    }
    const list = byType.get(key) ?? [];
    list.push(item);
    byType.set(key, list);
  }
  const rolled = [...byType.values()].map(mergeLicenseGroup);
  // Mass distinct license clocks are not separate Owner decisions.
  if (rolled.length > 3) return [...rest, mergeLicenseGroup(rolled)];
  return [...rest, ...rolled];
}

/** One Decision per instance. Plan wins over raw escalation. Same-key summaries roll up with count.
 *  Unplanned license renewals of the same type (incl. OL family) collapse to one card. */
export function rollupDecisions(items: Decision[]): Decision[] {
  const byInstance = new Map<string, Decision[]>();
  const bySummary = new Map<string, Decision[]>();
  const passthrough: Decision[] = [];

  for (const item of items) {
    const inst = instanceKey(item);
    if (inst) {
      const list = byInstance.get(inst) ?? [];
      list.push(item);
      byInstance.set(inst, list);
      continue;
    }
    const sum = summaryKey(item);
    if (sum) {
      const list = bySummary.get(sum) ?? [];
      list.push(item);
      bySummary.set(sum, list);
      continue;
    }
    passthrough.push(item);
  }

  const out: Decision[] = [];
  for (const group of byInstance.values()) out.push(mergeDecisionGroup(group));
  for (const group of bySummary.values()) out.push(mergeDecisionGroup(group));
  out.push(...passthrough);
  return rollupLicenseTypes(out);
}

export function humanDue(dueAt: string | null | undefined, now: Date = new Date()): string {
  if (!dueAt) return "Before next review";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "Before next review";
  const dueYmd = denverYmd(due);
  const nowYmd = denverYmd(now);
  if (dueYmd === nowYmd) return "Today";
  if (dueYmd === addDaysYmd(nowYmd, -1)) return "Yesterday";
  if (dueYmd < nowYmd) {
    const n = daysBetweenYmd(dueYmd, nowYmd);
    return n === 1 ? "Yesterday" : `${n} days overdue`;
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueYmd);
  if (!parts) return "Before next review";
  const month = MONTHS[Number(parts[2]) - 1];
  const day = Number(parts[3]);
  if (!month || !Number.isFinite(day)) return "Before next review";
  return `${month} ${day}`;
}

export function hasForbiddenDecisionCopy(text: string): boolean {
  return FORBIDDEN_DECISION_STRINGS.some((s) => text.includes(s));
}

export function scrubDecisionCopy(text: string): string {
  let out = text;
  out = out.replace(/DHHS91172/gi, "");
  out = out.replace(/§\s*[0-9]+(?:\.[0-9]+)*(?:\([^)]+\))*/g, "");
  out = out.replace(/licensing or repayment item/gi, "license clock");
  out = out.replace(/corrective action plan or repayment demand/gi, "license risk");
  out = out.replace(/not just a note on file/gi, "");
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  return out;
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  return first || null;
}

function shortTitle(title: string): string {
  return title
    .replace(/\s+[—–-]\s+.*$/, "")
    .replace(/\s+\(.*\)$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isSoloDecision(d: Decision): boolean {
  if (d.planKind === "solo_lapse" || d.planKind === "scheduled_while_lapsed") return true;
  if (d.trigger === "would_create_finding_if_scheduled") return true;
  return isBlocksSoloWhenLapsedKey(d.obligationKey);
}

function isLicenseDecision(d: Decision): boolean {
  return d.planKind === "license_risk" || d.trigger === "license_or_repayment_risk";
}

function isStandingDecision(d: Decision): boolean {
  return d.planKind === "standing_missing" || d.trigger === "standing_record_missing_30d";
}

function certShort(d: Decision): string {
  const key = d.obligationKey ?? "";
  if (key.startsWith("cpr")) return "CPR";
  if (key.includes("orientation")) return "orientation";
  if (key.includes("abi")) return "ABI training";
  if (key.includes("behavior")) return "intervention cert";
  const title = shortTitle(d.title);
  if (/cpr/i.test(title)) return "CPR";
  return title || "this clock";
}

function ifMissedFromAuditRef(ref: string): string | null {
  const match = /^(I{1,3}|IV)-(\d+)/.exec(ref);
  if (!match) return null;
  return `Part ${match[1]}.${match[2]} finding`;
}

export function ifMissedForDecision(d: Decision): string {
  const key = d.obligationKey ?? "";
  if (
    isSoloDecision(d) &&
    (d.trigger === "would_create_finding_if_scheduled" || d.planKind === "solo_lapse")
  ) {
    return "Part IV finding + safety risk";
  }
  if (key && IF_MISSED_BY_KEY[key]) return IF_MISSED_BY_KEY[key];
  const fromRef = ifMissedFromAuditRef(auditRefForObligationKey(key || null));
  if (fromRef) return fromRef;
  if (isLicenseDecision(d)) return "Part I finding";
  if (isStandingDecision(d)) return "Part I finding";
  if (d.trigger === "overdue") return "Part IV finding";
  if (d.source === "nectar_proposed") return "Part II finding";
  return "Part IV finding";
}

function headlineFor(d: Decision): string {
  const name = firstName(d.subjectName);
  const title = shortTitle(d.title);
  const n = d.count && d.count > 1 ? d.count : 0;

  if (/unanswered|compliance setup facts/i.test(d.title)) {
    return "Answer compliance setup facts";
  }
  if (/duty evaluation incomplete/i.test(d.title)) {
    return "Answer duty evaluation facts";
  }
  if (/assignment gaps/i.test(d.title)) {
    return "Answer assignment gaps";
  }
  if (d.source === "nectar_proposed") {
    if (n > 1 && /summar/i.test(d.title)) return `Approve ${n} quarterly summaries`;
    if (/discharge/i.test(title)) return `Approve the discharge process`;
    return `Approve ${title || "the draft"}`;
  }
  if (isSoloDecision(d)) {
    const cert = certShort(d);
    if (name) return `Sign off: ${name} off solo shifts until ${cert} renews`;
    return `Sign off solo shifts until ${cert} renews`;
  }
  if (isLicenseDecision(d)) {
    if (n > 1) {
      if ((d.obligationKey ?? "").startsWith("ol_") || /^ol\b/i.test(title)) {
        return `Renew ${n} OL licenses`;
      }
      if (/^overdue licenses$/i.test(title) || !title) {
        return `Renew ${n} overdue licenses`;
      }
      return `Renew ${n} ${title}`;
    }
    return `Renew ${title || "the license"}`;
  }
  if (isStandingDecision(d)) {
    if (/discharge/i.test(title)) return `Read and sign the discharge process`;
    return `Read and sign ${title || "the standing record"}`;
  }
  if (d.trigger === "half_window_not_started") {
    return `Start ${title || "this clock"}`;
  }
  if (d.trigger === "overdue" || d.planKind === "overdue") {
    return `Close ${title || "the overdue clock"}`;
  }
  if (d.planId) return `Approve ${title || "the plan"}`;
  return `Get ${title || "this done"}`;
}

function whyFor(d: Decision): string {
  const name = firstName(d.subjectName);
  const title = shortTitle(d.title);
  const n = d.count && d.count > 1 ? d.count : 0;
  if (d.planId && d.body.trim() && !hasForbiddenDecisionCopy(d.body)) {
    return scrubDecisionCopy(d.body.trim());
  }
  if (isSoloDecision(d)) {
    if (d.planId) {
      return name
        ? `Coverage is already rearranged so ${name} is not working alone. You are confirming the plan, not building it.`
        : "Coverage is already rearranged so this staff is not working alone. You are confirming the plan, not building it.";
    }
    return name
      ? `${name} cannot work alone until this clock is current. Confirm coverage before the next solo shift.`
      : "This staff cannot work alone until this clock is current. Confirm coverage before the next solo shift.";
  }
  if (isLicenseDecision(d)) {
    if (n > 1) {
      return `${n} license clocks need a logged renewal so the file stays current.`;
    }
    return `${title || "This license clock"} needs a logged renewal so the file stays current.`;
  }
  if (isStandingDecision(d)) {
    return "The only missing standing record. One signature closes it.";
  }
  if (d.source === "nectar_proposed") {
    return "Nectar drafted this from existing notes. Read, edit, and send.";
  }
  if (d.trigger === "half_window_not_started") {
    return `${title || "This clock"} is not started and is due soon. Start it before it goes overdue.`;
  }
  if (d.trigger === "overdue" || d.planKind === "overdue") {
    return name
      ? `${name}'s ${title || "clock"} is overdue. Log a plan to close it.`
      : `${title || "This clock"} is overdue. Log a plan to close it.`;
  }
  return `${title || "This item"} needs a decision this week.`;
}

function ownerTextFor(d: Decision, viewerUserId?: string | null): string {
  const mine = !d.ownerUserId || !viewerUserId || d.ownerUserId === viewerUserId;
  if (
    d.planId &&
    mine &&
    (d.planKind === "solo_lapse" || d.planKind === "scheduled_while_lapsed")
  ) {
    return "You · Supervisor did the work";
  }
  if (mine) return "You";
  if (d.ownerLabel === "manager") return "Supervisor";
  if (d.ownerLabel === "admin_level") return "Owner";
  return "Owner";
}

function actionFor(d: Decision): DecisionAction {
  if (d.planId || d.source === "nectar_proposed") {
    return { label: d.planId ? "Confirm" : "Review drafts", kind: "approve_plan" };
  }
  if (isLicenseDecision(d)) return { label: "Log the renewal", kind: "log_renewal" };
  if (isStandingDecision(d)) return { label: "Read and sign", kind: "read_and_sign" };
  return { label: "Log a plan", kind: "log_plan" };
}

export function decorateDecision(d: Decision, ctx: DecorateDecisionCtx = {}): Decision {
  const now = ctx.now ?? new Date();
  const headline = scrubDecisionCopy(headlineFor(d));
  const why = scrubDecisionCopy(whyFor(d));
  const ifMissed = ifMissedForDecision(d);
  const ownerText = ownerTextFor(d, ctx.viewerUserId);
  const dueText = humanDue(d.dueAt, now);
  const action = actionFor(d);
  return {
    ...d,
    headline,
    why,
    ownerText,
    dueText,
    ifMissed,
    action,
    mergedTriggers: d.mergedTriggers ?? (d.trigger ? [d.trigger] : []),
    count: d.count && d.count > 0 ? d.count : 1,
  };
}

export function lastSundayLabel(): string {
  return "Sunday";
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
