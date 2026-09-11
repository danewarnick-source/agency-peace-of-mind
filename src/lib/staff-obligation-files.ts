import { toDisplayNameCase } from "./person-name.ts";

export const OBLIGATION_FILE_STATUS_LABEL = {
  on_file: "On file",
  due_soon: "Due soon",
  missing: "Missing",
} as const;

export type ObligationFileStatus = keyof typeof OBLIGATION_FILE_STATUS_LABEL;

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

/** Valid evidence = accepted (instance closed) and not sitting in review. Uploaded ≠ accepted. */
export function hasValidObligationEvidence(args: {
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  hasCompletion: boolean;
  nectarValidationStatus?: string | null;
}): boolean {
  if (args.nectarValidationStatus === "failed" || args.nectarValidationStatus === "needs_review") {
    return false;
  }
  if (args.instanceStatus === "completed" || args.instanceStatus === "waived") return true;
  return false;
}

export function isAwaitingEvidenceReview(args: {
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  nectarValidationStatus?: string | null;
  correctionRequested?: boolean;
}): boolean {
  if (args.correctionRequested) return true;
  if (args.instanceStatus === "completed" || args.instanceStatus === "waived") return false;
  return args.nectarValidationStatus === "failed" || args.nectarValidationStatus === "needs_review";
}

export function staffFileCycleKind(args: {
  instanceId: string;
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  dueAt: string;
  peers: Array<{
    instanceId: string;
    instanceStatus: "pending" | "completed" | "overdue" | "waived";
    dueAt: string;
  }>;
}): "current" | "previous" {
  const open = args.peers.filter(
    (p) => p.instanceStatus === "pending" || p.instanceStatus === "overdue",
  );
  if (open.length) {
    return open.some((p) => p.instanceId === args.instanceId) ? "current" : "previous";
  }
  const latest = [...args.peers].sort((a, b) => b.dueAt.localeCompare(a.dueAt))[0];
  return latest?.instanceId === args.instanceId ? "current" : "previous";
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

/** Relative due copy for a personnel-file item. Overdue is still Missing in status. */
export function dueLabel(
  dueAt: string,
  now: Date = new Date(),
): { text: string; overdue: boolean } {
  const due = new Date(dueAt);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) {
    const od = Math.max(1, Math.ceil(Math.abs(diffMs) / 86_400_000));
    return { text: `Missing — ${od} day${od === 1 ? "" : "s"} ago`, overdue: true };
  }
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due in 1 day", overdue: false };
  return { text: `Due in ${days} days`, overdue: false };
}

/** Live item title — same substitution the compliance / personnel-file views use. */
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

/** Same On file / Due soon / Missing path the per-person Personnel file uses. */
export function statusForObligationInstance(args: {
  instanceStatus: "pending" | "completed" | "overdue" | "waived";
  dueAt: string;
  instanceUploadPath?: string | null;
  completion?: {
    upload_path?: string | null;
    nectar_validation_status?: string | null;
  } | null;
  now?: Date;
}): ObligationFileStatus {
  const hasCompletion = !!(
    args.completion ||
    args.instanceUploadPath ||
    args.instanceStatus === "completed" ||
    args.instanceStatus === "waived"
  );
  const hasValidEvidence = hasValidObligationEvidence({
    instanceStatus: args.instanceStatus,
    hasCompletion,
    nectarValidationStatus: args.completion?.nectar_validation_status ?? null,
  });
  return obligationFileStatus({
    instanceStatus: args.instanceStatus,
    dueAt: args.dueAt,
    hasValidEvidence,
    now: args.now,
  });
}

export type ObligationFileStatusCounts = {
  missing: number;
  due_soon: number;
  on_file: number;
};

export function emptyObligationFileStatusCounts(): ObligationFileStatusCounts {
  return { missing: 0, due_soon: 0, on_file: 0 };
}

export function tallyObligationFileStatus(
  counts: ObligationFileStatusCounts,
  status: ObligationFileStatus,
): void {
  counts[status] += 1;
}

export function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type PersonnelMissingCsvRow = {
  full_name: string;
  role: string;
  job_title: string | null;
  service_codes: string[];
  missing: number;
  due_soon: number;
  on_file: number;
  missing_items: Array<{ title: string; due_at: string }>;
};

/** Missing-item CSV for the org-wide Personnel file. Same statuses as the matrix. */
export function missingPersonnelCsv(rows: PersonnelMissingCsvRow[]): string {
  const header = [
    "Staff",
    "Role",
    "Job title",
    "Service codes",
    "Missing",
    "Due soon",
    "On file",
    "Missing items",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.full_name,
        r.role,
        r.job_title ?? "",
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

export type PersonnelPackFile = {
  staffName: string;
  title: string;
  filename: string;
  url: string;
};

/** Print pack HTML — same evidence-pull pattern as the per-person Personnel file. */
export function personnelPackHtml(files: PersonnelPackFile[]): string {
  const body = files
    .map((f) => {
      const media = /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.filename)
        ? `<img src="${escapeHtml(f.url)}" alt="" style="max-width:100%;" />`
        : `<iframe src="${escapeHtml(f.url)}" style="width:100%;height:80vh;border:0;"></iframe>`;
      return `<section style="page-break-after:always;margin-bottom:24px;"><h2 style="font:600 16px system-ui;">${escapeHtml(f.staffName)} — ${escapeHtml(f.title)}</h2>${media}</section>`;
    })
    .join("");
  return `<!doctype html><html><head><title>Staff file</title></head><body>${body}</body></html>`;
}
