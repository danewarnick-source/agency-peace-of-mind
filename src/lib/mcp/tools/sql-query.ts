import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "sql_query",
  title: "Run SQL query (read-only)",
  description:
    "Runs a read-only SQL query against the HIVE database as the signed-in user (row-level security applies). Only SELECT/WITH statements are allowed. Returns rows as JSON. Use this for any ad-hoc question about clients, shifts, timesheets, incidents, billing, certifications, etc.",
  inputSchema: {
    sql: z
      .string()
      .min(1)
      .describe(
        "SQL to execute. Must be a single read-only statement starting with SELECT or WITH. Do NOT include a trailing semicolon.",
      ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sql }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const trimmed = sql.trim().replace(/;+\s*$/, "");
    if (!/^\s*(select|with)\b/i.test(trimmed)) {
      return err("Only SELECT or WITH queries are allowed via sql_query.");
    }
    if (/;\s*\S/.test(trimmed)) {
      return err("Multiple statements are not allowed.");
    }
    const { data, error } = await supabaseForUser(ctx).rpc("mcp_exec_read_sql", {
      query: trimmed,
    });
    if (error) return err(error.message);
    return ok(data);
  },
});
