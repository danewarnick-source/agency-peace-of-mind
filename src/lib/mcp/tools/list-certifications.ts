import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "list_certifications",
  title: "List staff certifications",
  description:
    "Lists staff certifications. Optional `expiring_within_days` returns certs expiring in the next N days (from today).",
  inputSchema: {
    user_id: z.string().uuid().describe("Filter by staff user id.").optional(),
    expiring_within_days: z.number().int().min(0).max(365).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    let q = supabaseForUser(ctx).from("certifications").select("*");
    if (input.user_id) q = q.eq("user_id", input.user_id);
    if (typeof input.expiring_within_days === "number") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.expiring_within_days);
      q = q.lte("expiry_date", cutoff.toISOString().slice(0, 10));
    }
    q = q.order("expiry_date", { ascending: true }).limit(Math.min(500, input.limit ?? 100));
    const { data, error } = await q;
    if (error) return err(error.message);
    return ok(data);
  },
});
