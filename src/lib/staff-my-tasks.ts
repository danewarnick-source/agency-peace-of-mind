/**
 * Staff "My tasks" — one queue over existing obligation instances.
 * No second checklist table family.
 */
import { dueLabel } from "./staff-obligation-files.ts";
import { inHiveCourseIdForTitle, staffCourseProgressLabel } from "./in-hive-training.ts";
import { clientFormKindForTitle } from "./client-form-obligations.ts";
import { isFormUuid } from "./resolve-obligation-form.ts";

export const STAFF_TASK_ACTIONS = [
  "take_training",
  "continue_training",
  "read_and_sign",
  "upload_certificate",
  "complete_form",
  "fix_submission",
] as const;

export type StaffTaskActionKind = (typeof STAFF_TASK_ACTIONS)[number];

export const STAFF_TASK_ACTION_LABEL: Record<StaffTaskActionKind, string> = {
  take_training: "Take training",
  continue_training: "Continue training",
  read_and_sign: "Read and sign",
  upload_certificate: "Upload certificate",
  complete_form: "Complete form",
  fix_submission: "Fix submission",
};

export type StaffTaskEvidence = "course" | "attestation" | "upload" | "form";

export type StaffTaskInput = {
  instanceId: string;
  title: string;
  description?: string | null;
  source?: string | null;
  sourcePolicySection?: string | null;
  evidenceType: "attestation" | "upload" | "upload_and_attestation" | "form";
  linkedFormId?: string | null;
  dueAt: string;
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  nectarValidationStatus?: string | null;
  correctionRequested?: boolean;
  courseProgress?: { completed: number; total: number } | null;
  overridden?: boolean;
  overrideUntil?: string | null;
  now?: Date;
};

export type StaffTask = {
  instanceId: string;
  title: string;
  whyRequired: string;
  dueText: string;
  overdue: boolean;
  action: StaffTaskActionKind;
  actionLabel: string;
  progressLabel: string | null;
  pendingReview: boolean;
  evidence: StaffTaskEvidence;
  overridden: boolean;
  overrideUntil: string | null;
};

export function isPendingCertReview(status: string | null | undefined): boolean {
  return status === "failed" || status === "needs_review";
}

export function staffTaskWhyRequired(input: {
  source?: string | null;
  sourcePolicySection?: string | null;
  description?: string | null;
}): string {
  if (input.source === "sow") {
    return "Required on your staff file by the state contract.";
  }
  const section = input.sourcePolicySection?.trim();
  if (section) return section;
  const desc = input.description?.trim();
  if (desc) return desc;
  return "Required on your staff file.";
}

export function staffTaskEvidence(input: StaffTaskInput): StaffTaskEvidence {
  if (inHiveCourseIdForTitle(input.title)) return "course";
  if (clientFormKindForTitle(input.title) || input.evidenceType === "form") return "form";
  if (input.evidenceType === "upload" || input.evidenceType === "upload_and_attestation") {
    return "upload";
  }
  return "attestation";
}

export function staffTaskAction(input: StaffTaskInput): StaffTaskActionKind {
  if (input.correctionRequested || input.nectarValidationStatus === "failed") {
    return "fix_submission";
  }
  const evidence = staffTaskEvidence(input);
  if (evidence === "course") {
    const started = (input.courseProgress?.completed ?? 0) > 0;
    return started ? "continue_training" : "take_training";
  }
  if (evidence === "form") return "complete_form";
  if (evidence === "upload") return "upload_certificate";
  return "read_and_sign";
}

export function staffTaskProgressLabel(input: StaffTaskInput): string | null {
  const progress = input.courseProgress;
  if (!progress || progress.total <= 0) return null;
  return staffCourseProgressLabel(progress.completed, progress.total);
}

export function buildStaffTask(input: StaffTaskInput): StaffTask {
  const due = dueLabel(input.dueAt, input.now);
  const action = staffTaskAction(input);
  const pendingReview = isPendingCertReview(input.nectarValidationStatus);
  return {
    instanceId: input.instanceId,
    title: input.title,
    whyRequired: staffTaskWhyRequired(input),
    dueText: due.text,
    overdue: due.overdue,
    action,
    actionLabel: STAFF_TASK_ACTION_LABEL[action],
    progressLabel: staffTaskProgressLabel(input),
    pendingReview,
    evidence: staffTaskEvidence(input),
    overridden: !!input.overridden,
    overrideUntil: input.overrideUntil ?? null,
  };
}

export function staffTaskCanOpenForm(linkedFormId: string | null | undefined): boolean {
  return isFormUuid(linkedFormId ?? null);
}

export const STAFF_TASKS_FOOTER = "Your submissions and certificates stay in your staff file.";
