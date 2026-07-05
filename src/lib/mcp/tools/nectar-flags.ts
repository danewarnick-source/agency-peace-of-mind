import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "nectar_flags",
  title: "Open Nectar flags and warnings",
  description:
    "Aggregates open behavior-collection flags, shift completeness flags, and billing submission warnings the signed-in user can see.",
  inputSchema: {
    limit_per_source: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit_per_source }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const cap = Math.min(200, limit_per_source ?? 50);
    const sb = supabaseForUser(ctx);
    const [bc, shifts, billing] = await Promise.all([
      sb.from("bc_flags").select("*").order("created_at", { ascending: false }).limit(cap),
      sb.from("shift_completeness_flags").select("*").order("created_at", { ascending: false }).limit(cap),
      sb.from("billing_submission_warnings").select("*").order("created_at", { ascending: false }).limit(cap),
    ]);
    if (bc.error) return err(bc.error.message);
    if (shifts.error) return err(shifts.error.message);
    if (billing.error) return err(billing.error.message);
    return ok({
      bc_flags: bc.data ?? [],
      shift_completeness_flags: shifts.data ?? [],
      billing_submission_warnings: billing.data ?? [],
    });
  },
});
