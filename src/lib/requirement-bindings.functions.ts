/**
 * Requirement bindings — declare, per requirement, HOW it is satisfied
 * (auto/form/credential/training/upload/attestation/unbound). One row per
 * requirement. Additive: does not touch nectar_requirements or any existing
 * mapping table.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SATISFIED_BY = [
  "auto",
  "form",
  "credential",
  "training",
  "upload",
  "attestation",
  "unbound",
] as const;

const listInput = z.object({
  requirementIds: z.array(z.string().uuid()).min(1).max(500),
});

export const listBindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("requirement_bindings")
      .select(
        "id, requirement_id, satisfied_by, native_feature, engine_ref, notes, bound_by, updated_at",
      )
      .in("requirement_id", data.requirementIds);
    if (error) throw new Error(error.message);
    return { bindings: rows ?? [] };
  });

const setInput = z.object({
  requirementId: z.string().uuid(),
  satisfied_by: z.enum(SATISFIED_BY),
  native_feature: z.string().max(120).nullable().optional(),
  engine_ref: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const setBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => setInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify requirement + admin/manager on that org.
    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: req.organization_id as string,
      _user: userId,
    });
    if (!isAdmin) throw new Error("Admin or Manager role required");

    const payload = {
      requirement_id: data.requirementId,
      satisfied_by: data.satisfied_by,
      native_feature: data.native_feature ?? null,
      engine_ref: data.engine_ref ?? null,
      notes: data.notes ?? null,
      bound_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { data: row, error: uErr } = await supabase
      .from("requirement_bindings")
      .upsert(payload, { onConflict: "requirement_id" })
      .select(
        "id, requirement_id, satisfied_by, native_feature, engine_ref, notes, bound_by, updated_at",
      )
      .single();
    if (uErr) throw new Error(uErr.message);
    return { binding: row };
  });
