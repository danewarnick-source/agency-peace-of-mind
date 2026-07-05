import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

const FILTER_OPS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
] as const;

export default defineTool({
  name: "table_read",
  title: "Read from a table",
  description:
    "Structured read from any HIVE table (row-level security applies). Provide table name, optional columns to select, filters, ordering, and limit.",
  inputSchema: {
    table: z.string().min(1).describe("Table name in the public schema, e.g. 'clients'."),
    select: z
      .string()
      .describe("Comma-separated columns or PostgREST select expression. Defaults to '*'.")
      .optional(),
    filters: z
      .array(
        z.object({
          column: z.string(),
          op: z.enum(FILTER_OPS).describe("Filter operator."),
          value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean()]))]),
        }),
      )
      .describe("List of filters ANDed together. 'in' takes an array; 'is' takes null/true/false.")
      .optional(),
    order: z
      .object({
        column: z.string(),
        ascending: z.boolean().optional(),
      })
      .optional(),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ table, select, filters, order, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx)
      .from(table as never)
      .select(select ?? "*");
    for (const f of filters ?? []) {
      switch (f.op) {
        case "eq": q = q.eq(f.column as never, f.value as never); break;
        case "neq": q = q.neq(f.column as never, f.value as never); break;
        case "gt": q = q.gt(f.column as never, f.value as never); break;
        case "gte": q = q.gte(f.column as never, f.value as never); break;
        case "lt": q = q.lt(f.column as never, f.value as never); break;
        case "lte": q = q.lte(f.column as never, f.value as never); break;
        case "like": q = q.like(f.column as never, String(f.value)); break;
        case "ilike": q = q.ilike(f.column as never, String(f.value)); break;
        case "is": q = q.is(f.column as never, f.value as never); break;
        case "in": q = q.in(f.column as never, (f.value as unknown[]) ?? []); break;
      }
    }
    if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
    q = q.limit(Math.min(500, limit ?? 50));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});
