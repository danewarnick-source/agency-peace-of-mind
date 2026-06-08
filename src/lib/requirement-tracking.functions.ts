/**
 * Requirement tracking — server fn for updating provider-declared cadence,
 * "Tell NECTAR" note, and last-checked date on an existing requirement.
 *
 * Provider declares; NECTAR stores. Writes only to
 * nectar_requirements.metadata.tracking — no other table is touched.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FREQS = [
  "one_time",
  "per_employee",
  "per_shift",
  "per_code",
  "per_day",
  "per_week",
  "per_month",
  "per_quarter",
  "per_year",
  "per_billing_rate_unit",
  "ongoing",
] as const;

const inputSchema = z.object({
  requirementId: z.string().uuid(),
  frequency: z.enum(FREQS).nullable().optional(),
  tellNectarNote: z.string().max(2000).nullable().optional(),
  // YYYY-MM-DD
  lastCheckedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .nullable()
    .optional(),
});

export const updateRequirementTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id, metadata")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: req.organization_id as string,
      _user: userId,
    });
    if (!isAdmin) throw new Error("Admin or Manager role required");

    const md = (req.metadata ?? {}) as Record<string, unknown>;
    const prev = (md["tracking"] ?? {}) as Record<string, unknown>;

    const next: Record<string, unknown> = { ...prev };
    if (data.frequency !== undefined) next.frequency = data.frequency;
    if (data.tellNectarNote !== undefined)
      next.tell_nectar_note =
        data.tellNectarNote && data.tellNectarNote.trim().length
          ? data.tellNectarNote.trim()
          : null;
    if (data.lastCheckedAt !== undefined) next.last_checked_at = data.lastCheckedAt;
    next.updated_at = new Date().toISOString();
    next.updated_by = userId;

    const newMeta = { ...md, tracking: next };

    const { error: uErr } = await supabase
      .from("nectar_requirements")
      .update({ metadata: newMeta })
      .eq("id", data.requirementId);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, tracking: next };
  });
