// Server functions powering the "Finish onboarding" wizard on the client
// profile / Smart Import done page.
//
// Each save writes to the REAL table (clients, client_billing_codes,
// custom_field_values) so completed steps drop off the list immediately.
// Skips enqueue a notification reminder — never blocking.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { geocodeAddress } from "@/lib/geocode";

// Whitelist of clients-table columns the wizard may patch directly.
const PATCHABLE_CLIENT_COLS = new Set([
  "physical_address", "geofence_radius_feet",
  "is_own_guardian", "guardian_name", "guardian_phone",
  "guardian_relationship", "guardian_email", "guardian_address",
  "emergency_contact_name", "emergency_contact_phone",
  "special_directions", "allergies",
]);

// SOW-required fields with no clients column → routed to custom_field_values.
const SOW_CUSTOM_FIELDS: Array<{ key: string; label: string; type: "text" | "boolean" }> = [
  { key: "support_coordinator_name", label: "Support coordinator name", type: "text" },
  { key: "support_coordinator_phone", label: "Support coordinator phone", type: "text" },
  { key: "support_coordinator_email", label: "Support coordinator email", type: "text" },
  { key: "advanced_directives", label: "Advanced directives", type: "text" },
  { key: "emergency_medical_treatment_authorization", label: "Emergency medical treatment authorization", type: "boolean" },
];

async function assertOrgMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, userId: string, organizationId: string,
) {
  const { data } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("Forbidden: not a member of this organization");
}

// ---------------------------------------------------------------------------
// State readout for one client — drives the wizard's checklist.
// ---------------------------------------------------------------------------
export const getClientOnboardingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: client, error } = await sb
      .from("clients")
      .select(
        "id, organization_id, physical_address, home_latitude, home_longitude, geofence_radius_feet, is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email, emergency_contact_name, emergency_contact_phone, special_directions, allergies",
      )
      .eq("id", data.clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    const [{ count: assignedCount }, { data: codes }, { data: defs }] = await Promise.all([
      sb
        .from("staff_assignments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", client.organization_id)
        .eq("client_id", data.clientId),
      sb
        .from("client_billing_codes")
        .select("id, service_code, rate_per_unit, annual_unit_authorization, unit_type")
        .eq("organization_id", client.organization_id)
        .eq("client_id", data.clientId),
      sb
        .from("custom_field_definitions")
        .select("id, field_key, field_label, data_type")
        .eq("organization_id", client.organization_id)
        .eq("entity_kind", "client"),
    ]);

    const defByKey = new Map<string, { id: string; field_key: string }>(
      (defs ?? []).map((d: { id: string; field_key: string }) => [d.field_key, d]),
    );
    const defIds = (defs ?? []).map((d: { id: string }) => d.id);
    const { data: vals } = defIds.length
      ? await sb
          .from("custom_field_values")
          .select("definition_id, value_text, value_boolean")
          .eq("entity_kind", "client")
          .eq("entity_id", data.clientId)
          .in("definition_id", defIds)
      : { data: [] as Array<{ definition_id: string; value_text: string | null; value_boolean: boolean | null }> };
    const valByDef = new Map(
      ((vals ?? []) as Array<{ definition_id: string; value_text: string | null; value_boolean: boolean | null }>)
        .map((v) => [v.definition_id, v]),
    );

    const customByKey: Record<string, { value_text: string | null; value_boolean: boolean | null } | null> = {};
    for (const f of SOW_CUSTOM_FIELDS) {
      const def = defByKey.get(f.key);
      const v = def ? valByDef.get(def.id) ?? null : null;
      customByKey[f.key] = v;
    }

    // Skipped items live in a single comma-separated custom field so the
    // wizard remembers dismissals across reloads without a new table.
    const skippedDef = defByKey.get("_onboarding_skipped");
    const skippedRaw = skippedDef ? (valByDef.get(skippedDef.id)?.value_text ?? "") : "";
    const skipped = new Set(skippedRaw.split(",").map((s) => s.trim()).filter(Boolean));

    const missingRates = (codes ?? []).filter(
      (c: { rate_per_unit: number | null; annual_unit_authorization: number | null }) =>
        !c.rate_per_unit || c.rate_per_unit === 0 ||
        !c.annual_unit_authorization || c.annual_unit_authorization === 0,
    );

    const guardianOk =
      client.is_own_guardian === true ||
      (client.is_own_guardian === false &&
        !!client.guardian_name?.trim() &&
        !!client.guardian_phone?.trim());

    return {
      organizationId: client.organization_id as string,
      client,
      assignedCount: assignedCount ?? 0,
      missingRates,
      billingCodes: codes ?? [],
      sowCustomFields: SOW_CUSTOM_FIELDS.map((f) => ({
        ...f,
        value: customByKey[f.key],
      })),
      skipped: Array.from(skipped),
      doneFlags: {
        staff: (assignedCount ?? 0) > 0,
        home: client.home_latitude != null && client.home_longitude != null,
        rates: missingRates.length === 0,
        guardian: guardianOk,
      },
    };
  });

// ---------------------------------------------------------------------------
// Patch one client row + (when present) geocode a new address.
// ---------------------------------------------------------------------------
export const saveOnboardingClientPatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      patch: z.record(z.string(), z.unknown()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: client } = await sb
      .from("clients")
      .select("id, organization_id, physical_address, home_latitude")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (PATCHABLE_CLIENT_COLS.has(k)) safe[k] = v;
    }
    if (Object.keys(safe).length === 0) return { ok: true, geocoded: false };

    const { error: uErr } = await sb
      .from("clients")
      .update(safe)
      .eq("id", data.clientId);
    if (uErr) throw new Error(uErr.message);

    // Geocode when address was set / changed and we don't yet have coords.
    let geocoded = false;
    const addrPatched =
      typeof safe.physical_address === "string" &&
      safe.physical_address !== client.physical_address;
    if (addrPatched && client.home_latitude == null) {
      const hit = await geocodeAddress(safe.physical_address as string);
      if (hit) {
        await sb
          .from("clients")
          .update({ home_latitude: hit.lat, home_longitude: hit.lng })
          .eq("id", data.clientId);
        geocoded = true;
      }
    }
    return { ok: true, geocoded };
  });

// ---------------------------------------------------------------------------
// Set rate + authorization for one client_billing_codes row.
// ---------------------------------------------------------------------------
export const saveOnboardingBillingRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      codeId: z.string().uuid(),
      rate_per_unit: z.number().nonnegative(),
      annual_unit_authorization: z.number().int().nonnegative(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: row } = await sb
      .from("client_billing_codes")
      .select("id, organization_id")
      .eq("id", data.codeId)
      .maybeSingle();
    if (!row) throw new Error("Billing code row not found");
    await assertOrgMember(sb, context.userId, row.organization_id);

    const { error } = await sb
      .from("client_billing_codes")
      .update({
        rate_per_unit: data.rate_per_unit,
        annual_unit_authorization: data.annual_unit_authorization,
        rate_source: "manual",
        rate_source_at: new Date().toISOString(),
      })
      .eq("id", data.codeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Set or clear a SOW custom field value for a client.
// ---------------------------------------------------------------------------
export const saveOnboardingCustomField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      field_key: z.string().min(1),
      field_label: z.string().min(1),
      data_type: z.enum(["text", "boolean"]),
      value_text: z.string().nullable().optional(),
      value_boolean: z.boolean().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: client } = await sb
      .from("clients")
      .select("organization_id")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    const { data: def, error: defErr } = await sb
      .from("custom_field_definitions")
      .upsert(
        {
          organization_id: client.organization_id,
          entity_kind: "client",
          field_key: data.field_key,
          field_label: data.field_label,
          data_type: data.data_type,
          source: "manual",
        },
        { onConflict: "organization_id,entity_kind,field_key" },
      )
      .select("id")
      .single();
    if (defErr || !def) throw new Error(defErr?.message ?? "Unable to upsert definition");

    const { error } = await sb
      .from("custom_field_values")
      .upsert(
        {
          organization_id: client.organization_id,
          definition_id: def.id,
          entity_kind: "client",
          entity_id: data.clientId,
          value_text: data.value_text ?? null,
          value_boolean: data.value_boolean ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "definition_id,entity_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Skip an onboarding item — persist the dismissal + enqueue a non-blocking
// notification reminder.
// ---------------------------------------------------------------------------
export const skipOnboardingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      item: z.string().min(1),
      label: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: client } = await sb
      .from("clients")
      .select("id, organization_id, first_name, last_name")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    // Persist skip in a tiny shared custom field (comma-separated keys).
    const { data: def } = await sb
      .from("custom_field_definitions")
      .upsert(
        {
          organization_id: client.organization_id,
          entity_kind: "client",
          field_key: "_onboarding_skipped",
          field_label: "Onboarding items skipped",
          data_type: "text",
          source: "manual",
        },
        { onConflict: "organization_id,entity_kind,field_key" },
      )
      .select("id")
      .single();
    if (def) {
      const { data: existing } = await sb
        .from("custom_field_values")
        .select("value_text")
        .eq("definition_id", def.id)
        .eq("entity_id", data.clientId)
        .maybeSingle();
      const set = new Set(
        (existing?.value_text ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
      );
      set.add(data.item);
      await sb
        .from("custom_field_values")
        .upsert(
          {
            organization_id: client.organization_id,
            definition_id: def.id,
            entity_kind: "client",
            entity_id: data.clientId,
            value_text: Array.from(set).join(","),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "definition_id,entity_id" },
        );
    }

    const fullName = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "client";
    const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await sb.from("notifications").upsert(
      {
        organization_id: client.organization_id,
        recipient_role: "admin",
        type: "client_onboarding_gap",
        urgency: "normal",
        title: `Finish onboarding: ${data.label}`,
        body: `Skipped during onboarding for ${fullName}. Reopen the client profile to complete it.`,
        link_to: `/dashboard/clients/${data.clientId}`,
        related_id: data.clientId,
        related_type: "client",
        recurrence_key: `client_onboarding:${data.clientId}:${data.item}`,
        next_remind_at: week,
      },
      { onConflict: "organization_id,recurrence_key" },
    );
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Add one or more DSPD service codes to a client. Used by the inline "Add
// billing code" control on the readiness card + onboarding wizard — no
// navigation: upsert client_billing_codes (default rate 0, default annual
// auth 0) and merge codes into clients.authorized_dspd_codes + job_code.
// ---------------------------------------------------------------------------
export const addClientBillingCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      codes: z.array(z.string().min(1).max(8)).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { isDailyServiceCode } = await import("@/lib/service-billing");

    const { data: client } = await sb
      .from("clients")
      .select("id, organization_id, authorized_dspd_codes, job_code")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    await assertOrgMember(sb, context.userId, client.organization_id);

    const codes = Array.from(
      new Set(data.codes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
    );
    if (codes.length === 0) return { ok: true, added: 0 };

    const rows = codes.map((code) => ({
      organization_id: client.organization_id,
      client_id: data.clientId,
      service_code: code,
      unit_type: isDailyServiceCode(code) ? "day" : "unit",
      annual_unit_authorization: 0,
      rate_per_unit: 0,
    }));
    const { data: upserted, error: uErr } = await sb
      .from("client_billing_codes")
      .upsert(rows, { onConflict: "organization_id,client_id,service_code" })
      .select("id");
    if (uErr) throw new Error(uErr.message);
    if (!upserted || upserted.length === 0) {
      throw new Error("No billing-code rows were written.");
    }

    const mergedAuthorized = Array.from(
      new Set([...(client.authorized_dspd_codes ?? []), ...codes]),
    );
    const mergedJobCode = Array.from(
      new Set([...(client.job_code ?? []), ...codes]),
    );
    const { error: cErr } = await sb
      .from("clients")
      .update({
        authorized_dspd_codes: mergedAuthorized,
        job_code: mergedJobCode,
      })
      .eq("id", data.clientId);
    if (cErr) throw new Error(cErr.message);

    return { ok: true, added: upserted.length };
  });
