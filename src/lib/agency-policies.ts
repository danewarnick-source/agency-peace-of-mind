/**
 * Agency Policies binder — contractor's own policies (SOW §1.8(4) topic P).
 *
 * One binder per agency. Admin adds a title, an audience, and a file or
 * pasted text. Hive turns that into a company obligation. Staff complete
 * it from My Obligations by reading or watching and attesting. This is
 * not a lesson authoring tool and does not replace the 30-day course.
 */

export const AGENCY_POLICY_BUCKET = "agency-policies";
export const AGENCY_POLICY_MAX_BYTES = 100 * 1024 * 1024;
export const AGENCY_POLICY_SOURCE_SECTION = "SOW §1.8(4) topic P — contractor’s own policies";

export const AGENCY_POLICY_ATTESTATION =
  "I have read or watched this agency policy and understand that I am expected to follow it.";

export const POLICY_AUDIENCE_KINDS = ["everyone", "drivers", "job_code"] as const;
export type PolicyAudienceKind = (typeof POLICY_AUDIENCE_KINDS)[number];

export const POLICY_FILE_ACCEPT = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
] as const;

const POLICY_EXT_OK = new Set([
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".mp4",
  ".webm",
  ".mov",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
]);

export type AgencyPolicyRow = {
  id: string;
  organization_id: string;
  title: string;
  audience_kind: PolicyAudienceKind;
  audience_job_code: string | null;
  body_text: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  obligation_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PolicyAudienceInput = {
  kind: PolicyAudienceKind;
  jobCode?: string | null;
};

export type StaffAudienceFacts = {
  staffTypeKeys: string[];
  position?: string | null;
  department?: string | null;
  assignedServiceCodes?: string[];
  isTransporter?: boolean;
};

export function isPolicyAudienceKind(value: string): value is PolicyAudienceKind {
  return (POLICY_AUDIENCE_KINDS as readonly string[]).includes(value);
}

export function audienceLabel(kind: PolicyAudienceKind, jobCode?: string | null): string {
  if (kind === "everyone") return "Everyone";
  if (kind === "drivers") return "Drivers";
  const code = (jobCode ?? "").trim();
  return code ? `Job code ${code}` : "A job code";
}

export function policyFileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function isAllowedPolicyFile(file: { name: string; type?: string; size: number }): string | null {
  if (!file.name.trim()) return "Choose a file.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > AGENCY_POLICY_MAX_BYTES) return "Files must be 100 MB or smaller.";
  const ext = policyFileExtension(file.name);
  const mime = (file.type ?? "").toLowerCase();
  const mimeOk = !mime || (POLICY_FILE_ACCEPT as readonly string[]).includes(mime);
  if (!POLICY_EXT_OK.has(ext) && !mimeOk) {
    return "Use a PDF, slides, Word doc, image, or video.";
  }
  return null;
}

const DRIVER_KEYS = ["driver", "drivers", "transporter", "transport", "mtp"];

export function staffLooksLikeDriver(facts: StaffAudienceFacts): boolean {
  if (facts.isTransporter) return true;
  const hay = [
    ...facts.staffTypeKeys,
    facts.position ?? "",
    facts.department ?? "",
    ...(facts.assignedServiceCodes ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return DRIVER_KEYS.some((k) => hay.includes(k));
}

export function staffMatchesPolicyAudience(
  audience: PolicyAudienceInput,
  facts: StaffAudienceFacts,
): boolean {
  if (audience.kind === "everyone") return true;
  if (audience.kind === "drivers") return staffLooksLikeDriver(facts);
  const want = (audience.jobCode ?? "").trim().toUpperCase();
  if (!want) return false;
  const keys = facts.staffTypeKeys.map((k) => k.trim().toUpperCase());
  if (keys.includes(want)) return true;
  const codes = (facts.assignedServiceCodes ?? []).map((c) => c.trim().toUpperCase());
  return codes.includes(want);
}

export function policyHasContent(input: { bodyText?: string | null; fileName?: string | null }): boolean {
  return Boolean((input.bodyText ?? "").trim() || (input.fileName ?? "").trim());
}

export function policyMediaKind(mime: string | null | undefined, fileName?: string | null): "video" | "image" | "pdf" | "other" {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  const ext = policyFileExtension(fileName ?? "");
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov") return "video";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return "image";
  if (ext === ".pdf") return "pdf";
  return "other";
}
