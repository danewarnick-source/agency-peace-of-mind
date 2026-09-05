/**
 * Pure Admin Home derivation helpers (no React / Supabase).
 * The hook in use-admin-home-data.ts is the query surface.
 */

const DENVER = "America/Denver";

export const INSTANCES_SELECT = [
  "id",
  "due_at",
  "obligation_id",
  "client_id",
  "company_obligations!company_obligation_instances_obligation_id_fkey(title,source_policy_section,scope)",
  "company_obligation_instance_assignees!company_obligation_instance_assignees_instance_id_fkey(staff_id,staff_name,client_id)",
  "company_obligation_completions!company_obligation_completions_instance_id_fkey(id,nectar_extracted_expires_date,nectar_extracted_cert_type)",
].join(",");

export type ObligationEmbed = {
  title: string | null;
  source_policy_section: string | null;
  scope: string | null;
};

export type AssigneeEmbed = {
  staff_id: string;
  staff_name: string;
  client_id: string | null;
};

export type CompletionEmbed = {
  id: string;
  nectar_extracted_expires_date: string | null;
  nectar_extracted_cert_type: string | null;
};

export type InstanceRow = {
  id: string;
  due_at: string;
  obligation_id: string;
  client_id: string | null;
  company_obligations: ObligationEmbed | ObligationEmbed[] | null;
  company_obligation_instance_assignees: AssigneeEmbed[] | AssigneeEmbed | null;
  company_obligation_completions: CompletionEmbed[] | CompletionEmbed | null;
};

export type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  authorized_dspd_codes: string[] | null;
};

export type StaffRow = {
  id: string;
  name: string;
  overdue: number;
  pending: number;
};

export function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function asMany<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function denverYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DENVER,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function denverHour(date: Date): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER,
    hour: "numeric",
    hour12: false,
  }).format(date);
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour) || hour === 24) return 0;
  return hour;
}

export function greetingWord(date: Date): "morning" | "afternoon" | "evening" {
  const hour = denverHour(date);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function sessionFirstName(
  user: { user_metadata?: Record<string, unknown>; email?: string | null } | null,
): string {
  const meta = user?.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  if (first) return first;
  const full =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (full) return full.split(/\s+/)[0] ?? "there";
  const fromEmail = user?.email?.split("@")[0]?.trim();
  return fromEmail || "there";
}

function ymdParts(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

export function addDaysYmd(ymd: string, days: number): string {
  const parts = ymdParts(ymd);
  if (!parts) return ymd;
  const utc = Date.UTC(parts.y, parts.m - 1, parts.d + days);
  const next = new Date(utc);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = ymdParts(fromYmd);
  const to = ymdParts(toYmd);
  if (!from || !to) return 0;
  const a = Date.UTC(from.y, from.m - 1, from.d);
  const b = Date.UTC(to.y, to.m - 1, to.d);
  return Math.round((b - a) / 86_400_000);
}

export function formatDenverLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: DENVER,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatDueDate(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString("en-US", {
    timeZone: DENVER,
    month: "short",
    day: "numeric",
  });
}

export function nextBillingWindowLabel(now = new Date()): string {
  const today = denverYmd(now);
  const parts = ymdParts(today);
  if (!parts) return "";
  const nextMonth = parts.m === 12 ? 1 : parts.m + 1;
  const nextYear = parts.m === 12 ? parts.y + 1 : parts.y;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(nextYear, nextMonth - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${monthName} 1 — ${monthName} ${lastDay}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function obligationTitle(row: InstanceRow): string {
  return asOne(row.company_obligations)?.title?.trim() || "Obligation";
}

export function sowSection(row: InstanceRow): string {
  return asOne(row.company_obligations)?.source_policy_section?.trim() || "";
}

export function obligationScope(row: InstanceRow): string {
  return (asOne(row.company_obligations)?.scope ?? "").toLowerCase();
}

export function isComplete(row: InstanceRow): boolean {
  return asMany(row.company_obligation_completions).length > 0;
}

/** Per-staff overdue / pending counts. Query-key: admin-home-staff-status. */
export function selectAdminHomeStaffStatus(instances: InstanceRow[], todayYmd: string): StaffRow[] {
  const staffMap = new Map<string, StaffRow>();
  for (const row of instances) {
    const complete = isComplete(row);
    const dueYmd = denverYmd(new Date(row.due_at));
    const isOverdue = !complete && dueYmd < todayYmd;
    const isPending = !complete && dueYmd >= todayYmd;
    for (const a of asMany(row.company_obligation_instance_assignees)) {
      const staff = staffMap.get(a.staff_id) ?? {
        id: a.staff_id,
        name: a.staff_name || "Staff",
        overdue: 0,
        pending: 0,
      };
      if (isOverdue) staff.overdue += 1;
      else if (isPending) staff.pending += 1;
      staffMap.set(a.staff_id, staff);
    }
  }
  return [...staffMap.values()].sort((a, b) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue;
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.name.localeCompare(b.name);
  });
}
