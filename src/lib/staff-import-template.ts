// Staff CSV template for Smart Import (employee mode). Columns are dynamic —
// built from the org's Settings → Staff fields configuration
// (organizations.feature_config.staff_intake_fields) — so the download only
// ever shows fields this org actually collects. Email is the login
// identifier; there is no username column.
import Papa from "papaparse";
import type { StaffIntakeFieldsConfig } from "@/components/hr/staff-fields-panel";

export const STAFF_TEMPLATE_UNIVERSAL_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "hire_date",
  "role",
] as const;

export const STAFF_TYPE_HEADER = "staff_type (multi-value, comma separated)";

function customFieldHeader(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

export function buildStaffTemplateHeaders(config: StaffIntakeFieldsConfig): string[] {
  const headers: string[] = [...STAFF_TEMPLATE_UNIVERSAL_HEADERS];
  if (config.staff_type.enabled) headers.push(STAFF_TYPE_HEADER);
  if (config.department.enabled) headers.push("department");
  if (config.employee_id.enabled) headers.push("employee_id");
  if (config.worker_type.enabled) headers.push("worker_type");
  for (const f of config.custom_fields) {
    if (f.at_hire) headers.push(customFieldHeader(f.name));
  }
  return headers;
}

const EXAMPLE_VALUES: Record<string, string> = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane.doe@example.com",
  phone: "555-123-4567",
  hire_date: "2026-07-01",
  role: "employee",
  [STAFF_TYPE_HEADER]: "SLN, HHS",
  department: "Host Home",
  employee_id: "1042",
  worker_type: "W2 Employee",
};

export function buildStaffTemplateCsv(config: StaffIntakeFieldsConfig): string {
  const headers = buildStaffTemplateHeaders(config);
  const row: Record<string, string> = {};
  for (const h of headers) row[h] = EXAMPLE_VALUES[h] ?? "";
  return Papa.unparse({ fields: headers, data: [row] });
}

export function triggerCsvDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
