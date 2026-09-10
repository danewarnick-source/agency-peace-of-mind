/**
 * Employees-only Excel/CSV roster upload.
 * Fixed columns. Never maps guardian / meds / PCSP / billing / client fields.
 */
import Papa from "papaparse";
import { isValidSignupEmail, normalizeSignupEmail } from "./signup-email.ts";
import {
  isValidUsername,
  resolveAccountUsername,
} from "./account-username.ts";
import { uniqueHireEmails } from "./employee-roster.ts";

export const EMPLOYEE_ROSTER_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "role",
  "title",
  "hire_date",
  "username",
] as const;

export type EmployeeRosterHeader = (typeof EMPLOYEE_ROSTER_HEADERS)[number];

export type EmployeeRosterRole = "admin" | "program_manager" | "manager" | "employee" | "committee_member";

/** createInvitation / resendInvitation only accept these three. */
export type EmployeeInviteRole = "admin" | "manager" | "employee";

export type EmployeeRosterDraft = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  title: string;
  hire_date: string;
  username: string;
  username_provided: boolean;
};

export type EmployeeRosterUploadMode = "add_new" | "add_and_update" | "update_only";
export type EmployeeRosterRowAction = "create" | "update" | "skip";

export type EmployeeRosterIssue = { field: EmployeeRosterHeader | "row"; message: string };

const HEADER_ALIASES: Record<string, EmployeeRosterHeader> = {
  first_name: "first_name",
  firstname: "first_name",
  first: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  last: "last_name",
  email: "email",
  email_address: "email",
  e_mail: "email",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  role: "role",
  title: "title",
  job_title: "title",
  hire_date: "hire_date",
  start_date: "hire_date",
  username: "username",
  user_name: "username",
  login: "username",
};

const CLIENT_ONLY_HEADERS = [
  "guardian",
  "medicaid",
  "pcsp",
  "medication",
  "meds",
  "billing",
  "billing_code",
  "service_code",
  "client",
  "client_record",
];

const ROLE_ALIASES: Record<string, EmployeeRosterRole> = {
  employee: "employee",
  staff: "employee",
  dsp: "employee",
  manager: "manager",
  supervisor: "manager",
  admin: "admin",
  owner: "admin",
  program_manager: "program_manager",
  committee_member: "committee_member",
  committee: "committee_member",
};

const EXAMPLE_ROW: Record<EmployeeRosterHeader, string> = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane.doe@example.com",
  phone: "555-123-4567",
  role: "employee",
  title: "Direct Support",
  hire_date: "2026-07-01",
  username: "jane.doe@example.com",
};

function slugHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function normalizeEmployeeRosterHeader(raw: string): EmployeeRosterHeader | null {
  return HEADER_ALIASES[slugHeader(raw)] ?? null;
}

export function isClientOnlyRosterHeader(raw: string): boolean {
  const slug = slugHeader(raw);
  return CLIENT_ONLY_HEADERS.some((h) => slug === h || slug.startsWith(`${h}_`));
}

export function parseEmployeeRosterRole(raw: string): EmployeeRosterRole | null {
  const key = slugHeader(raw);
  if (!key) return "employee";
  return ROLE_ALIASES[key] ?? null;
}

export function toInviteRole(raw: string): EmployeeInviteRole {
  const parsed = parseEmployeeRosterRole(raw);
  if (parsed === "admin") return "admin";
  if (parsed === "manager" || parsed === "program_manager") return "manager";
  return "employee";
}

export function normalizeRosterEmailSet(emails: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of emails) {
    const email = normalizeSignupEmail(raw);
    if (email) out.add(email);
  }
  return out;
}

/** Connecteam-style: match existing roster rows on email. */
export function classifyRosterRowAction(
  email: string,
  existingEmails: Iterable<string>,
  mode: EmployeeRosterUploadMode,
): EmployeeRosterRowAction {
  const exists = normalizeRosterEmailSet(existingEmails).has(normalizeSignupEmail(email));
  if (mode === "add_new") return exists ? "skip" : "create";
  if (mode === "update_only") return exists ? "update" : "skip";
  return exists ? "update" : "create";
}

export function normalizeHireDate(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) {
    const [m, d, y] = t.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n > 20000 && n < 80000) {
      const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000;
      return new Date(utc).toISOString().slice(0, 10);
    }
  }
  return t;
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyEmployeeRosterDraft(): EmployeeRosterDraft {
  return {
    id: newRowId(),
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "employee",
    title: "",
    hire_date: "",
    username: "",
    username_provided: false,
  };
}

export function buildEmployeeRosterTemplateCsv(): string {
  return Papa.unparse({
    fields: [...EMPLOYEE_ROSTER_HEADERS],
    data: [EXAMPLE_ROW],
  });
}

export function triggerEmployeeRosterTemplateDownload(): void {
  const blob = new Blob([buildEmployeeRosterTemplateCsv()], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "employee-roster-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function mapRawRosterRow(
  raw: Record<string, string>,
  headers: string[],
): EmployeeRosterDraft {
  const mapped: Record<string, string> = {};
  for (const header of headers) {
    if (isClientOnlyRosterHeader(header)) continue;
    const key = normalizeEmployeeRosterHeader(header);
    if (!key) continue;
    mapped[key] = String(raw[header] ?? "").trim();
  }
  const email = normalizeSignupEmail(mapped.email ?? "");
  const rawRole = (mapped.role ?? "").trim();
  const usernameRaw = (mapped.username ?? "").trim();
  return {
    id: newRowId(),
    first_name: mapped.first_name ?? "",
    last_name: mapped.last_name ?? "",
    email,
    phone: mapped.phone ?? "",
    role: rawRole || "employee",
    title: mapped.title ?? "",
    hire_date: normalizeHireDate(mapped.hire_date ?? ""),
    username: usernameRaw || email,
    username_provided: Boolean(usernameRaw),
  };
}

export function parseEmployeeRosterCsv(text: string): {
  rows: EmployeeRosterDraft[];
  ignoredColumns: string[];
} {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = res.meta.fields ?? [];
  const ignoredColumns = headers.filter((h) => isClientOnlyRosterHeader(h) || !normalizeEmployeeRosterHeader(h));
  const rows = (res.data ?? [])
    .map((raw) => mapRawRosterRow(raw, headers))
    .filter((row) => row.first_name || row.last_name || row.email);
  return { rows, ignoredColumns };
}

export function parseEmployeeRosterRecords(
  records: Record<string, string>[],
  headers: string[],
): { rows: EmployeeRosterDraft[]; ignoredColumns: string[] } {
  const ignoredColumns = headers.filter((h) => isClientOnlyRosterHeader(h) || !normalizeEmployeeRosterHeader(h));
  const rows = records
    .map((raw) => mapRawRosterRow(raw, headers))
    .filter((row) => row.first_name || row.last_name || row.email);
  return { rows, ignoredColumns };
}

export function validateEmployeeRosterRows(rows: EmployeeRosterDraft[]): Map<string, EmployeeRosterIssue[]> {
  const issues = new Map<string, EmployeeRosterIssue[]>();
  const dup = uniqueHireEmails(rows.map((r) => r.email));
  for (const row of rows) {
    const list: EmployeeRosterIssue[] = [];
    if (!row.first_name.trim()) list.push({ field: "first_name", message: "First name is required." });
    if (!row.last_name.trim()) list.push({ field: "last_name", message: "Last name is required." });
    if (!isValidSignupEmail(row.email)) list.push({ field: "email", message: "Enter a valid email." });
    if (!row.phone.trim()) list.push({ field: "phone", message: "Phone is required." });
    if (!parseEmployeeRosterRole(row.role)) list.push({ field: "role", message: "Use employee, manager, or admin." });
    if (row.hire_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.hire_date)) {
      list.push({ field: "hire_date", message: "Use YYYY-MM-DD." });
    }
    const username = resolveAccountUsername({ username: row.username, email: row.email });
    if (row.username.trim() && !isValidUsername(row.username)) {
      list.push({ field: "username", message: "Use the email, or a 3–32 character handle." });
    } else if (username && !isValidUsername(username) && row.email) {
      list.push({ field: "username", message: "Use the email, or a 3–32 character handle." });
    }
    if (dup && normalizeSignupEmail(row.email) === dup) {
      list.push({ field: "email", message: "This email is listed more than once." });
    }
    if (list.length) issues.set(row.id, list);
  }
  return issues;
}

export function rosterRowHasFieldIssue(
  issues: Map<string, EmployeeRosterIssue[]>,
  rowId: string,
  field: EmployeeRosterHeader,
): boolean {
  return (issues.get(rowId) ?? []).some((i) => i.field === field);
}
