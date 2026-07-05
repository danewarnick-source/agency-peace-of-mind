import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "list_incidents",
  title: "List incident reports",
  description: "Lists incident reports with optional filters. Row-level security applies.",
  inputSchema: {
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    client_id: z.string().uuid().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx).from("incident_reports").select("*");
    if (input.start_date) q = q.gte("incident_date", input.start_date);
    if (input.end_date) q = q.lte("incident_date", input.end_date);
    if (input.client_id) q = q.eq("client_id", input.client_id);
    if (input.status) q = q.eq("status", input.status);
    q = q.order("incident_date", { ascending: false }).limit(Math.min(500, input.limit ?? 50));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});
