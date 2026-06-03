import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Kind = z.enum(["employee", "client"]);

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
      .select("id, field_key, field_label, data_type")
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
