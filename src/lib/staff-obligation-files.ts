import { toDisplayNameCase } from "./person-name.ts";

export const OBLIGATION_FILE_STATUS_LABEL = {
  on_file: "On file",
  due_soon: "Due soon",
  missing: "Missing",
} as const;

export type ObligationFileStatus = keyof typeof OBLIGATION_FILE_STATUS_LABEL;

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

/** Valid evidence = completed/waived, or a completion that Nectar did not reject. */
export function hasValidObligationEvidence(args: {
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  hasCompletion: boolean;
  nectarValidationStatus?: string | null;
}): boolean {
  if (args.nectarValidationStatus === "failed") return false;
  if (args.instanceStatus === "completed" || args.instanceStatus === "waived") return true;
  return args.hasCompletion;
}

/**
 * Employee-profile file labels. Only these three — never "Have".
 * On file wins; else due within 7 days (and not yet past) is Due soon; else Missing.
 */
export function obligationFileStatus(args: {
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  dueAt: string;
  hasValidEvidence: boolean;
  now?: Date;
}): ObligationFileStatus {
  if (args.hasValidEvidence) return "on_file";
  const due = new Date(args.dueAt).getTime();
  if (Number.isNaN(due)) return "missing";
  const now = (args.now ?? new Date()).getTime();
  if (due >= now && due - now <= DUE_SOON_MS) return "due_soon";
  return "missing";
}

/** Live obligation title — same substitution the compliance / My Obligations views use. */
export function liveObligationTitle(
  title: string,
  scope: string,
  clientName?: string | null,
): string {
  if (scope === "staff_per_client" && clientName) {
    return title.replace("[Client Name]", toDisplayNameCase(clientName));
  }
  return title;
}

export function obligationFileStatusLabel(status: ObligationFileStatus): string {
  return OBLIGATION_FILE_STATUS_LABEL[status];
}
