import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "list_billing_submissions",
  title: "List billing submissions",
  description:
    "Lists recent billing submissions with optional filters, plus any warnings attached to each submission.",
  inputSchema: {
    status: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb.from("billing_submissions").select("*, billing_submission_warnings(*)");
    if (input.status) q = q.eq("status", input.status);
    if (input.start_date) q = q.gte("created_at", input.start_date);
    if (input.end_date) q = q.lte("created_at", input.end_date);
    q = q.order("created_at", { ascending: false }).limit(Math.min(200, input.limit ?? 25));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});
