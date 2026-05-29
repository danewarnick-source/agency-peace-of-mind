import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Kind = z.enum(["employee", "client"]);

async function assertOrgMember(
  userId: string,
  orgId: string,
  opts?: { requireManager?: boolean },
) {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("role,active")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  if (opts?.requireManager && !["admin", "manager", "super_admin"].includes(data.role)) {
    throw new Error("Forbidden: manager or admin role required");
  }
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
    await assertOrgMember(context.userId, data.organizationId);

    const { data: defs } = await supabaseAdmin
      .from("custom_field_definitions")
      .select("id, field_key, field_label, data_type")
      .eq("organization_id", data.organizationId)
      .eq("entity_kind", data.entityKind)
      .order("created_at", { ascending: true });

    const { data: vals } = await supabaseAdmin
      .from("custom_field_values")
      .select("definition_id, value_text, value_number, value_boolean, value_date")
      .eq("organization_id", data.organizationId)
      .eq("entity_kind", data.entityKind)
      .eq("entity_id", data.entityId);

    const valMap = new Map((vals ?? []).map((v) => [v.definition_id, v]));
    return (defs ?? []).map((d) => ({
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
      value_text: z.string().max(10000).nullable().optional(),
      value_number: z.number().nullable().optional(),
      value_boolean: z.boolean().nullable().optional(),
      value_date: z.string().max(40).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertOrgMember(context.userId, data.organizationId, { requireManager: true });

    // Verify the definition actually belongs to this org (defense in depth).
    const { data: def } = await supabaseAdmin
      .from("custom_field_definitions")
      .select("id")
      .eq("id", data.definitionId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!def) throw new Error("Forbidden: definition does not belong to this organization");

    const { error } = await supabaseAdmin.from("custom_field_values").upsert({
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
