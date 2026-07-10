import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SECTION_NAMES } from "@/lib/client-staff-visibility";

const Kind = z.enum(["employee", "client"]);
const Section = z.enum(SECTION_NAMES as unknown as [string, ...string[]]);
const DataType = z.enum(["text", "number", "boolean", "date"]);

// Verifies caller is an active member of the org before any DB access.
// Uses the user-scoped supabase client from requireSupabaseAuth context,
// so RLS on custom_field_definitions / custom_field_values is the enforced
// safety net even if this check is ever bypassed.
async function assertOrgMember(
  supabase: any,
  userId: string,
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: not a member of this organization");
}

export const getCustomFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      entityKind: Kind,
      entityId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgMember(supabase, userId, data.organizationId);

    const { data: defs, error: defsErr } = await supabase
      .from("custom_field_definitions")
      .select("id, field_key, field_label, data_type, source, section")
      .eq("organization_id", data.organizationId)
      .eq("entity_kind", data.entityKind)
      .order("created_at", { ascending: true });
    if (defsErr) throw new Error(defsErr.message);

    const { data: vals, error: valsErr } = await supabase
      .from("custom_field_values")
      .select("definition_id, value_text, value_number, value_boolean, value_date")
      .eq("organization_id", data.organizationId)
      .eq("entity_kind", data.entityKind)
      .eq("entity_id", data.entityId);
    if (valsErr) throw new Error(valsErr.message);

    const valMap = new Map((vals ?? []).map((v: any) => [v.definition_id, v]));
    return (defs ?? []).map((d: any) => ({
      id: d.id,
      field_key: d.field_key,
      field_label: d.field_label,
      data_type: d.data_type as "text" | "number" | "boolean" | "date",
      source: (d.source ?? "manual") as "manual" | "pcsp",
      section: (d.section ?? "identity") as
        | "identity" | "care_plan" | "billing" | "files" | "operations" | "compliance",
      value: valMap.get(d.id) ?? null,
    }));
  });

export const setCustomFieldValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      definitionId: z.string().uuid(),
      entityKind: Kind,
      entityId: z.string().uuid(),
      value_text: z.string().nullable().optional(),
      value_number: z.number().nullable().optional(),
      value_boolean: z.boolean().nullable().optional(),
      value_date: z.string().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgMember(supabase, userId, data.organizationId);

    // Confirm the definition belongs to the same org — prevents writing a
    // value referencing another org's definition.
    const { data: def, error: defErr } = await supabase
      .from("custom_field_definitions")
      .select("id")
      .eq("id", data.definitionId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (defErr) throw new Error(defErr.message);
    if (!def) throw new Error("Forbidden: definition not in this organization");

    const { error } = await supabase.from("custom_field_values").upsert({
      organization_id: data.organizationId,
      definition_id: data.definitionId,
      entity_kind: data.entityKind,
      entity_id: data.entityId,
      value_text: data.value_text ?? null,
      value_number: data.value_number ?? null,
      value_boolean: data.value_boolean ?? null,
      value_date: data.value_date ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "definition_id,entity_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Create a new custom field definition, pinned to one of the six client
 * profile sections. The section drives staff visibility (via the parent
 * section's toggle) — there's no separate per-field switch.
 *
 * `field_key` is derived from the label so a human-readable slug shows up
 * in exports/API responses. Collisions bump `-2`, `-3`, etc.
 */
export const createCustomFieldDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      entityKind: Kind,
      section: Section,
      field_label: z.string().min(1).max(120),
      data_type: DataType,
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgMember(supabase, userId, data.organizationId);

    const baseKey = data.field_label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "custom_field";

    // Find a unique key within the org+entityKind scope.
    let key = baseKey;
    for (let i = 2; i < 100; i++) {
      const { data: existing } = await supabase
        .from("custom_field_definitions")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("entity_kind", data.entityKind)
        .eq("field_key", key)
        .maybeSingle();
      if (!existing) break;
      key = `${baseKey}_${i}`;
    }

    const { data: inserted, error } = await supabase
      .from("custom_field_definitions")
      .insert({
        organization_id: data.organizationId,
        entity_kind: data.entityKind,
        field_key: key,
        field_label: data.field_label,
        data_type: data.data_type,
        section: data.section,
        source: "manual",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted!.id as string };
  });

export const deleteCustomFieldDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      definitionId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOrgMember(supabase, userId, data.organizationId);
    const { error } = await supabase
      .from("custom_field_definitions")
      .delete()
      .eq("id", data.definitionId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
