import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is"] as const;

export default defineTool({
  name: "table_write",
  title: "Insert / update / delete rows",
  description:
    "Mutates a HIVE table (row-level security applies). Choose op = 'insert' | 'update' | 'delete'. Inserts take `values` (single object or array). Updates take `values` and `filters`. Deletes take `filters`. Returns affected rows.",
  inputSchema: {
    table: z.string().min(1),
    op: z.enum(["insert", "update", "delete"]),
    values: z
      .union([z.record(z.unknown()), z.array(z.record(z.unknown()))])
      .describe("Row data for insert or update.")
      .optional(),
    filters: z
      .array(
        z.object({
          column: z.string(),
          op: z.enum(FILTER_OPS),
          value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean()]))]),
        }),
      )
      .describe("Required for update/delete; disallowed for insert.")
      .optional(),
    returning: z.string().describe("PostgREST select for returned rows. Defaults to '*'.").optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ table, op, values, filters, returning }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx).from(table as never);
    const ret = returning ?? "*";

    if (op === "insert") {
      if (!values) return err("`values` is required for insert.");
      const { data, error } = await sb.insert(values as never).select(ret);
      if (error) return err(error.message);
      return ok(data);
    }

    if (op === "update") {
      if (!values || Array.isArray(values)) return err("`values` must be a single object for update.");
      if (!filters?.length) return err("`filters` are required for update to avoid updating every row.");
      let q = sb.update(values as never);
      for (const f of filters) q = applyFilter(q, f);
      const { data, error } = await q.select(ret);
      if (error) return err(error.message);
      return ok(data);
    }

    if (op === "delete") {
      if (!filters?.length) return err("`filters` are required for delete.");
      let q = sb.delete();
      for (const f of filters) q = applyFilter(q, f);
      const { data, error } = await q.select(ret);
      if (error) return err(error.message);
      return ok(data);
    }

    return err(`Unknown op: ${op}`);
  },
});

function applyFilter<T>(q: T, f: { column: string; op: string; value: unknown }): T {
  const anyQ = q as unknown as Record<string, (...args: unknown[]) => T>;
  switch (f.op) {
    case "eq": return anyQ.eq(f.column, f.value);
    case "neq": return anyQ.neq(f.column, f.value);
    case "gt": return anyQ.gt(f.column, f.value);
    case "gte": return anyQ.gte(f.column, f.value);
    case "lt": return anyQ.lt(f.column, f.value);
    case "lte": return anyQ.lte(f.column, f.value);
    case "in": return anyQ.in(f.column, (f.value as unknown[]) ?? []);
    case "is": return anyQ.is(f.column, f.value);
    default: return q;
  }
}
