import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listClientsTool from "./tools/list-clients";
import sqlQueryTool from "./tools/sql-query";
import listTablesTool from "./tools/list-tables";
import tableReadTool from "./tools/table-read";
import tableWriteTool from "./tools/table-write";
import getClientTool from "./tools/get-client";
import listShiftsTool from "./tools/list-shifts";
import listTimesheetsTool from "./tools/list-timesheets";
import listIncidentsTool from "./tools/list-incidents";
import listCertificationsTool from "./tools/list-certifications";
import listBillingSubmissionsTool from "./tools/list-billing-submissions";
import coverageStatusTool from "./tools/coverage-status";
import nectarFlagsTool from "./tools/nectar-flags";

// Build the OAuth issuer from the direct Supabase project ref. VITE_SUPABASE_URL
// is rewritten to the `.lovable.cloud` proxy on publish, which mcp-js rejects
// (RFC 8414 issuer mismatch). The project ref survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hive-mcp",
  title: "HIVE",
  version: "0.2.0",
  instructions:
    "HIVE compliance-platform tools. Every call runs as the signed-in HIVE user and row-level security applies — you see exactly what that user sees in the app.\n\n" +
    "Generic tools:\n" +
    "- `sql_query`: run any SELECT/WITH query. Best for ad-hoc questions.\n" +
    "- `table_read` / `table_write`: structured PostgREST-style reads and mutations against any table.\n" +
    "- `list_tables`: discover tables and columns.\n\n" +
    "Curated domain tools:\n" +
    "- `whoami`, `list_clients`, `get_client`\n" +
    "- `list_shifts`, `list_timesheets`, `list_incidents`, `list_certifications`\n" +
    "- `list_billing_submissions`, `coverage_status`, `nectar_flags`\n\n" +
    "Prefer curated tools when they fit; fall back to `sql_query` or `table_read` for anything else.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listClientsTool,
    getClientTool,
    listShiftsTool,
    listTimesheetsTool,
    listIncidentsTool,
    listCertificationsTool,
    listBillingSubmissionsTool,
    coverageStatusTool,
    nectarFlagsTool,
    listTablesTool,
    tableReadTool,
    tableWriteTool,
    sqlQueryTool,
  ],
});
