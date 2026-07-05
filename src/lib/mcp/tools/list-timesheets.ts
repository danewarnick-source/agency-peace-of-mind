import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "list_timesheets",
  title: "List EVV timesheets",
  description:
    "Lists EVV timesheet entries with optional filters. Row-level security applies.",
  inputSchema: {
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    staff_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    service_code: z.string().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx).from("evv_timesheets").select("*");
    if (input.start_date) q = q.gte("clock_in_at", input.start_date);
    if (input.end_date) q = q.lte("clock_in_at", input.end_date);
    if (input.staff_id) q = q.eq("staff_id", input.staff_id);
    if (input.client_id) q = q.eq("client_id", input.client_id);
    if (input.service_code) q = q.eq("service_code", input.service_code);
    if (input.status) q = q.eq("status", input.status);
    q = q.order("clock_in_at", { ascending: false }).limit(Math.min(500, input.limit ?? 50));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});
