import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "list_tables",
  title: "List tables and columns",
  description:
    "Lists tables (and optionally their columns) in the HIVE public schema so you can discover what's queryable. Read-only.",
  inputSchema: {
    include_columns: z
      .boolean()
      .describe("If true, include column names and data types for each table. Defaults to false.")
      .optional(),
    table: z
      .string()
      .describe("If provided, only return metadata for this table.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_columns, table }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    if (include_columns || table) {
      const q = sb
        .from("mcp_column_catalog" as never)
        .select("table_name, column_name, data_type, is_nullable")
        .order("table_name")
        .order("ordinal_position" as never);
      const { data, error } = table ? await q.eq("table_name" as never, table) : await q;
      if (error) return err(error.message);
      return ok(data);
    }
    const { data, error } = await sb
      .from("mcp_table_catalog" as never)
      .select("table_name")
      .order("table_name");
    if (error) return err(error.message);
    return ok(data);
  },
});
