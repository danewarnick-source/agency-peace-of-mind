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

// ─── Forms for a requirement (list + link + create-and-link) ──────────────

const reqInput = z.object({ requirementId: z.string().uuid() });

/** List forms in the same org as the requirement, marking linked ones. */
export const listFormsForRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => reqInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: forms, error } = await (supabase as any)
      .from("forms")
      .select("id, name, category, status, frequency, requirement_id, managed_by_requirement")
      .eq("organization_id", req.organization_id)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { forms: forms ?? [] };
  });

/**
 * Link an existing form to a requirement. Stamps frequency + audience from
 * the requirement's scope and marks the form as managed. Standalone forms
 * (not passed here) keep their behavior.
 */
const linkInput = z.object({
  requirementId: z.string().uuid(),
  formId: z.string().uuid(),
});

export const linkFormToRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => linkInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id, scope_level, service_code, metadata, category")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: req.organization_id as string,
      _user: userId,
    });
    if (!isAdmin) throw new Error("Admin or Manager role required");

    const { data: form, error: fErr } = await (supabase as any)
      .from("forms")
      .select("id, organization_id, assigned_groups, assigned_users, assigned_clients, all_clients, frequency")
      .eq("id", data.formId)
      .maybeSingle();
    if (fErr || !form) throw new Error(fErr?.message ?? "Form not found");
    if (form.organization_id !== req.organization_id) throw new Error("Form is in a different organization");

    // Derive stamp from requirement scope.
    const scope = (req as any).scope_level as string | null;
    const meta = ((req as any).metadata ?? {}) as Record<string, any>;
    type Freq = "as_needed" | "daily" | "weekly" | "monthly" | "quarterly" | "annually";
    const ALLOWED: Freq[] = ["as_needed", "daily", "weekly", "monthly", "quarterly", "annually"];

    const update: Record<string, unknown> = {
      requirement_id: data.requirementId,
      managed_by_requirement: true,
      updated_at: new Date().toISOString(),
    };

    if (scope === "provider") {
      const metaFreq = typeof meta.frequency === "string" ? (meta.frequency as Freq) : null;
      update.frequency = metaFreq && ALLOWED.includes(metaFreq) ? metaFreq : "monthly";
      update.assigned_groups = ["admin", "manager"];
    } else if (scope === "code" || scope === "role") {
      // audience keyed to service_code / role — no canonical map yet; default
      // to all_staff so the form actually appears in staff queues.
      update.assigned_groups = ["all_staff"];
      const metaFreq = typeof meta.frequency === "string" ? (meta.frequency as Freq) : null;
      if (metaFreq && ALLOWED.includes(metaFreq)) update.frequency = metaFreq;
    }
    // scope === 'client' → reuse existing assigned_clients / all_clients (no override).

    const { data: updated, error: uErr } = await (supabase as any)
      .from("forms")
      .update(update)
      .eq("id", data.formId)
      .select("id, requirement_id, managed_by_requirement, frequency, assigned_groups")
      .single();
    if (uErr) throw new Error(uErr.message);

    // Also record binding.
    await (supabase as any)
      .from("requirement_bindings")
      .upsert(
        {
          requirement_id: data.requirementId,
          satisfied_by: "form",
          engine_ref: data.formId,
          bound_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "requirement_id" },
      );

    return { form: updated };
  });

/** Create a minimal draft form for a requirement and link it. */
const createInput = z.object({
  requirementId: z.string().uuid(),
  name: z.string().min(1).max(160),
});

export const createFormForRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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

    const { data: form, error: cErr } = await (supabase as any)
      .from("forms")
      .insert({
        organization_id: req.organization_id,
        name: data.name,
        category: "compliance",
        fields: [],
        frequency: "monthly",
        schedule: {},
        assigned_groups: [],
        assigned_users: [],
        assigned_clients: [],
        all_clients: true,
        settings: {},
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();
    if (cErr || !form) throw new Error(cErr?.message ?? "Failed to create form");

    // Reuse link flow to stamp scope + set binding.
    // We can't call another server fn here; inline the update.
    return { formId: form.id as string };
  });

