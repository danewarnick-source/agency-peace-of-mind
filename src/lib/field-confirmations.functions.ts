// Server functions for tracked-field confirmations.
// - getClientFieldStates: computes has/none/unknown for every TRACKED_FIELD
//   using real data checks plus the clients.field_confirmations jsonb.
// - setFieldConfirmation: writes one key into clients.field_confirmations.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TRACKED_FIELDS, fieldState, type FieldState } from "@/lib/field-confirmations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOrgMember(sb: any, userId: string, organizationId: string) {
  const { data } = await sb
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a member of this organization");
}

export type FieldStateMap = Record<string, FieldState>;

export const getClientFieldStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{
    states: FieldStateMap;
    confirmations: Record<string, string>;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: client } = await sb
      .from("clients")
      .select(
        "id, organization_id, allergies, dysphagia, swallowing_alerts, special_directions, is_own_guardian, guardian_name, field_confirmations",
      )
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    const confirmations =
      (client.field_confirmations as Record<string, string> | null) ?? {};

    // Real-data probes for keys that live in their own table.
    const { count: medCount } = await sb
      .from("client_medications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", client.organization_id)
      .eq("client_id", data.clientId)
      .eq("is_active", true);

    // Custom-field-backed fields share one query.
    const customKeys = TRACKED_FIELDS
      .map((f) => f.key)
      .filter((k) =>
        ![
          "medications", "allergies", "dysphagia", "swallowing_alerts",
          "clinical_alert", "guardian",
        ].includes(k),
      );
    const { data: defs } = await sb
      .from("custom_field_definitions")
      .select("id, field_key")
      .eq("organization_id", client.organization_id)
      .eq("entity_kind", "client")
      .in("field_key", customKeys);
    const defIds = ((defs ?? []) as Array<{ id: string; field_key: string }>).map((d) => d.id);
    const { data: vals } = defIds.length
      ? await sb
          .from("custom_field_values")
          .select("definition_id, value_text, value_boolean")
          .eq("entity_id", data.clientId)
          .in("definition_id", defIds)
      : { data: [] as Array<{ definition_id: string; value_text: string | null; value_boolean: boolean | null }> };
    const keyByDefId = new Map(
      ((defs ?? []) as Array<{ id: string; field_key: string }>).map((d) => [d.id, d.field_key]),
    );
    const customHas = new Set<string>();
    for (const v of (vals ?? []) as Array<{ definition_id: string; value_text: string | null; value_boolean: boolean | null }>) {
      const key = keyByDefId.get(v.definition_id);
      if (!key) continue;
      if ((v.value_text && v.value_text.trim().length) || v.value_boolean === true) {
        customHas.add(key);
      }
    }

    // hasData rules per key.
    const hasMap: Record<string, boolean> = {
      medications: (medCount ?? 0) > 0,
      allergies: Array.isArray(client.allergies) && (client.allergies as unknown[]).length > 0,
      dysphagia: client.dysphagia === true,
      swallowing_alerts: Array.isArray(client.swallowing_alerts) && (client.swallowing_alerts as unknown[]).length > 0,
      clinical_alert: !!(client.special_directions && String(client.special_directions).trim()),
      // Guardian state is "has" when either branch is positively configured:
      // self-guardian = true OR is_own_guardian = false + a guardian name.
      guardian:
        client.is_own_guardian === true ||
        (client.is_own_guardian === false && !!client.guardian_name?.trim()),
    };
    for (const k of customKeys) hasMap[k] = customHas.has(k);

    const states: FieldStateMap = {};
    for (const f of TRACKED_FIELDS) {
      states[f.key] = fieldState(confirmations, f.key, !!hasMap[f.key]);
    }
    return { states, confirmations };
  });

export const setFieldConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      key: z.string().min(1),
      value: z.enum(["has", "none", "unknown"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: client } = await sb
      .from("clients")
      .select("organization_id, field_confirmations")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    const cur =
      (client.field_confirmations as Record<string, string> | null) ?? {};
    const next = { ...cur, [data.key]: data.value };

    const { data: updated, error } = await sb
      .from("clients")
      .update({ field_confirmations: next })
      .eq("id", data.clientId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Update did not affect any row");
    return { ok: true, confirmations: next };
  });
