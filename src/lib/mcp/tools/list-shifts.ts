import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "list_shifts",
  title: "List scheduled shifts",
  description:
    "Lists scheduled shifts with optional filters. Row-level security applies.",
  inputSchema: {
    start_date: z.string().describe("ISO date/time lower bound (inclusive).").optional(),
    end_date: z.string().describe("ISO date/time upper bound (inclusive).").optional(),
    staff_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx).from("scheduled_shifts").select("*");
    if (input.start_date) q = q.gte("start_time", input.start_date);
    if (input.end_date) q = q.lte("start_time", input.end_date);
    if (input.staff_id) q = q.eq("staff_id", input.staff_id);
    if (input.client_id) q = q.eq("client_id", input.client_id);
    if (input.status) q = q.eq("status", input.status);
    q = q.order("start_time", { ascending: true }).limit(Math.min(500, input.limit ?? 50));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});
