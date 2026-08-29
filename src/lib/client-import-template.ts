// Client CSV template for Smart Import (client mode). Columns match the
// heuristic mapper in smart-import.functions.ts — no NECTAR required.
import Papa from "papaparse";
import { triggerCsvDownload } from "@/lib/staff-import-template";

export const CLIENT_TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "phone",
  "address",
  "medicaid_id",
  "job_code",
  "team_name",
  "guardian_name",
  "guardian_phone",
] as const;

const EXAMPLE_VALUES: Record<string, string> = {
  first_name: "Alex",
  last_name: "Rivera",
  date_of_birth: "1998-04-12",
  phone: "555-987-6543",
  address: "123 Main St, Salt Lake City, UT",
  medicaid_id: "071235926",
  job_code: "HHS",
  team_name: "Host Home",
  guardian_name: "Jordan Rivera",
  guardian_phone: "555-111-2222",
};

export function buildClientTemplateCsv(): string {
  const headers = [...CLIENT_TEMPLATE_HEADERS];
  const row: Record<string, string> = {};
  for (const h of headers) row[h] = EXAMPLE_VALUES[h] ?? "";
  return Papa.unparse({ fields: headers, data: [row] });
}

export function downloadClientTemplate(): void {
  triggerCsvDownload(buildClientTemplateCsv(), "client-import-template.csv");
}
