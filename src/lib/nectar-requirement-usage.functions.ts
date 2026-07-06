/**
 * Authoritative Sources — provider-editable "usage note", obligation
 * recategorization, and per-code activation. Every write is append-only for
 * audit; the original requirement wording is never touched here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OBLIGATION_CATEGORIES = [
  "admin_internal",
  "admin_external",
  "client",
  "staff",
  "provider_wide",
  "billing_code",
] as const;

/** Append a new usage-note version. Never overwrites; old versions retained. */
export const saveRequirementUsageNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        requirementId: z.string().uuid(),
        usageNote: z.string().min(1).max(8000),
        editReason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error: rErr } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id")
      .eq("id", data.requirementId)
      .single();
    if (rErr || !req) throw new Error(rErr?.message ?? "Requirement not found");

    const { data: prev } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_requirement_usage_current_v" as any)
      .select("usage_id")
      .eq("requirement_id", data.requirementId)
      .maybeSingle();

    const { data: inserted, error: iErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_requirement_usage" as any)
      .insert({
        organization_id: req.organization_id,
        requirement_id: data.requirementId,
        usage_note: data.usageNote.trim(),
        edit_reason: data.editReason?.trim() || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supersedes_id: (prev as any)?.usage_id ?? null,
        edited_by: userId,
      })
      .select("id, edited_at")
      .single();
    if (iErr) throw new Error(iErr.message);
    return { ok: true as const, usage: inserted };
  });

/** Recategorize obligation type; logs to category_history. */
export const recategorizeRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        requirementId: z.string().uuid(),
        toCategory: z.enum(OBLIGATION_CATEGORIES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: req, error } = await supabase
      .from("nectar_requirements")
      .select("id, organization_id, obligation_category")
      .eq("id", data.requirementId)
      .single();
    if (error || !req) throw new Error(error?.message ?? "Not found");

    const { error: hErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_requirement_category_history" as any)
      .insert({
        organization_id: req.organization_id,
        requirement_id: data.requirementId,
        from_category: req.obligation_category,
        to_category: data.toCategory,
        change_source: "provider",
        changed_by: userId,
      });
    if (hErr) throw new Error(hErr.message);

    const { error: uErr } = await supabase
      .from("nectar_requirements")
      .update({
        obligation_category: data.toCategory,
        obligation_category_source: "provider",
      })
      .eq("id", data.requirementId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true as const };
  });

/** One-click activation for all pending requirements tied to a service code. */
export const activateCodeRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        serviceCode: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: data.organizationId,
      _user: userId,
    });
    if (!isAdmin) throw new Error("Admin or Manager role required");

    // Count pending reqs for this code (title match OR in service_codes_all)
    const { data: pending, error: pErr } = await supabase
      .from("nectar_requirements")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("obligation_category", "billing_code")
      .eq("activation_state", "pending_code_activation")
      .or(
        `service_code.eq.${data.serviceCode},service_codes_all.cs.{${data.serviceCode}}`,
      );
    if (pErr) throw new Error(pErr.message);
    const ids = (pending ?? []).map((r) => r.id);

    const now = new Date().toISOString();
    const { data: activation, error: aErr } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("nectar_code_activations" as any)
      .insert({
        organization_id: data.organizationId,
        service_code: data.serviceCode,
        requirement_count_at_confirm: ids.length,
        confirmed_by: userId,
        confirmed_at: now,
      })
      .select("id, confirmed_at")
      .single();
    if (aErr) throw new Error(aErr.message);

    if (ids.length > 0) {
      const { error: upErr } = await supabase
        .from("nectar_requirements")
        .update({
          activation_state: "active_by_code",
          activated_at: now,
          activated_by: userId,
        })
        .in("id", ids);
      if (upErr) throw new Error(upErr.message);
    }
    return { ok: true as const, activatedCount: ids.length, activation };
  });

/** Toggle the optional "Confirmed" marker (does not gate anything). */
export const toggleRequirementOptionalConfirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ requirementId: z.string().uuid(), confirmed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("nectar_requirements")
      .update({ confirmed_optional: data.confirmed })
      .eq("id", data.requirementId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Held codes for the org that still have pending activations (drives banner). */
export const listPendingCodeActivations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: authCodes }, { data: pendingReqs }] = await Promise.all([
      supabase
        .from("provider_authorized_codes")
        .select("code")
        .eq("organization_id", data.organizationId)
        .is("archived_at", null),
      supabase
        .from("nectar_requirements")
        .select("service_code")
        .eq("organization_id", data.organizationId)
        .eq("obligation_category", "billing_code")
        .eq("activation_state", "pending_code_activation"),
    ]);
    const held = new Set(
      (authCodes ?? []).map((r) => (r as { code: string }).code),
    );
    const counts = new Map<string, number>();
    for (const r of pendingReqs ?? []) {
      const c = (r as { service_code: string | null }).service_code;
      if (!c || !held.has(c)) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([service_code, pending_count]) => ({ service_code, pending_count }))
      .sort((a, b) => a.service_code.localeCompare(b.service_code));
  });
