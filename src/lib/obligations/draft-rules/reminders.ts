/**
 * Reminder / escalation offsets (draft simulation).
 * 30 / 14 / 7 / 1-day style defaults are PRODUCT DEFAULTS, not SOW mandates.
 * Configurable. Dedupe identical pending rows. Resolve on verified acceptance.
 * Pending review reminds the reviewer, not a repeated staff-upload nag.
 */

import { evidenceChangesCompliance } from "./evidence-reuse.ts";
import type { EvidenceLifecycle } from "./types.ts";

export const PRODUCT_REMINDER_OFFSETS_DAYS = [30, 14, 7, 1] as const;
export type ProductReminderOffsetDays = (typeof PRODUCT_REMINDER_OFFSETS_DAYS)[number];

export const PRODUCT_REMINDER_AUTHORITY = {
  label: "product_default",
  isSowMandate: false,
  summary:
    "30/14/7/1-day reminder offsets are configurable product defaults. They are not DHHS91172 SOW-mandated intervals.",
} as const;

export const REMINDER_TARGETS = ["staff", "reviewer"] as const;
export type ReminderTarget = (typeof REMINDER_TARGETS)[number];

export type ReminderDefaultConfig = {
  offsetsDaysBeforeDue: readonly number[];
  authority: typeof PRODUCT_REMINDER_AUTHORITY;
};

export const DEFAULT_REMINDER_CONFIG: ReminderDefaultConfig = {
  offsetsDaysBeforeDue: PRODUCT_REMINDER_OFFSETS_DAYS,
  authority: PRODUCT_REMINDER_AUTHORITY,
};

export type SyntheticReminderSubject = {
  assignmentId: string;
  ruleId: string;
  staffId: string;
  reviewerId: string | null;
  dueAt: string;
  lifecycle: EvidenceLifecycle;
};

export type SyntheticReminderEvent = {
  assignmentId: string;
  ruleId: string;
  target: ReminderTarget;
  targetId: string;
  offsetDays: number;
  dueAt: string;
  asOf: string;
};

export type SimulatedReminder = {
  assignmentId: string;
  ruleId: string;
  target: ReminderTarget;
  targetId: string;
  offsetDays: number;
  dueAt: string;
  authority: "product_default";
  isSowMandate: false;
  resolved: boolean;
};

export type SimulatedReminderResult = {
  authority: typeof PRODUCT_REMINDER_AUTHORITY;
  pending: SimulatedReminder[];
  resolvedAssignmentIds: string[];
  dedupedCount: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIso(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntilDue(dueAt: string, asOf: Date): number | null {
  const due = parseIso(dueAt);
  if (!due) return null;
  return Math.round((due.getTime() - asOf.getTime()) / MS_PER_DAY);
}

/** Submitted / needs_correction remind the reviewer. Staff upload is not re-nagged. */
export function reminderTargetForLifecycle(lifecycle: EvidenceLifecycle): ReminderTarget {
  if (lifecycle === "submitted" || lifecycle === "needs_correction") return "reviewer";
  return "staff";
}

export function reminderResolvesOnAcceptance(lifecycle: EvidenceLifecycle): boolean {
  return evidenceChangesCompliance(lifecycle);
}

export function reminderDedupeKey(row: {
  assignmentId: string;
  ruleId: string;
  target: ReminderTarget;
  targetId: string;
  offsetDays: number;
  dueAt: string;
}): string {
  return [
    row.assignmentId,
    row.ruleId,
    row.target,
    row.targetId,
    String(row.offsetDays),
    row.dueAt,
  ].join(":");
}

export function mergeReminderConfig(
  override?: Partial<Pick<ReminderDefaultConfig, "offsetsDaysBeforeDue">>,
): ReminderDefaultConfig {
  const offsets = override?.offsetsDaysBeforeDue ?? PRODUCT_REMINDER_OFFSETS_DAYS;
  const cleaned = [...new Set(offsets.filter((n) => Number.isFinite(n) && n >= 0))].sort(
    (a, b) => b - a,
  );
  return {
    offsetsDaysBeforeDue: cleaned,
    authority: PRODUCT_REMINDER_AUTHORITY,
  };
}

function targetIdFor(subject: SyntheticReminderSubject, target: ReminderTarget): string | null {
  if (target === "reviewer") return subject.reviewerId;
  return subject.staffId;
}

/**
 * Build pending product-default reminders. Accepted evidence resolves.
 * Duplicate events for the same assignment/target/offset/due collapse.
 */
export function simulateReminders(input: {
  subjects: readonly SyntheticReminderSubject[];
  events?: readonly SyntheticReminderEvent[];
  asOf: Date;
  config?: Partial<Pick<ReminderDefaultConfig, "offsetsDaysBeforeDue">>;
}): SimulatedReminderResult {
  const config = mergeReminderConfig(input.config);
  const resolvedAssignmentIds: string[] = [];
  const pending: SimulatedReminder[] = [];
  const seen = new Set<string>();
  let dedupedCount = 0;

  const extraByAssignment = new Map<string, SyntheticReminderEvent[]>();
  for (const event of input.events ?? []) {
    const list = extraByAssignment.get(event.assignmentId) ?? [];
    list.push(event);
    extraByAssignment.set(event.assignmentId, list);
  }

  for (const subject of input.subjects) {
    if (reminderResolvesOnAcceptance(subject.lifecycle)) {
      resolvedAssignmentIds.push(subject.assignmentId);
      continue;
    }
    const target = reminderTargetForLifecycle(subject.lifecycle);
    const targetId = targetIdFor(subject, target);
    if (!targetId) continue;

    const daysLeft = daysUntilDue(subject.dueAt, input.asOf);
    const offsets =
      daysLeft == null
        ? []
        : config.offsetsDaysBeforeDue.filter((offset) => daysLeft <= offset && daysLeft >= 0);

    const candidates: Array<{ offsetDays: number; dueAt: string }> = offsets.map((offsetDays) => ({
      offsetDays,
      dueAt: subject.dueAt,
    }));
    for (const event of extraByAssignment.get(subject.assignmentId) ?? []) {
      if (event.ruleId !== subject.ruleId) continue;
      candidates.push({ offsetDays: event.offsetDays, dueAt: event.dueAt || subject.dueAt });
    }

    for (const candidate of candidates) {
      const row: SimulatedReminder = {
        assignmentId: subject.assignmentId,
        ruleId: subject.ruleId,
        target,
        targetId,
        offsetDays: candidate.offsetDays,
        dueAt: candidate.dueAt,
        authority: "product_default",
        isSowMandate: false,
        resolved: false,
      };
      const key = reminderDedupeKey(row);
      if (seen.has(key)) {
        dedupedCount += 1;
        continue;
      }
      seen.add(key);
      pending.push(row);
    }
  }

  return {
    authority: PRODUCT_REMINDER_AUTHORITY,
    pending,
    resolvedAssignmentIds,
    dedupedCount,
  };
}
