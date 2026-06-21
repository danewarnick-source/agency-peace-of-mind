// =============================================================
// Shared client autofill — apply parsed PCSP/intake/1056 fields
// onto a clients row and seed client_billing_codes.
//
// Used by:
//  - per-client document upload (src/lib/nectar-documents.functions.ts)
//  - Smart Import commit (src/lib/smart-import-commit.functions.ts)
//
// Behavior:
//  - Confidence-gated (>= 0.6) for AI-sourced fields.
//  - Never overwrites existing non-empty scalars (suggests instead).
//  - Merges + dedupes array columns.
//  - Upserts client_billing_codes by (org, client, service_code).
// =============================================================

export interface ExtractedField {
  field_key: string;
  field_group?: string | null;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_bool?: boolean | null;
  value_array?: string[] | null;
  value_json?: unknown;
  source_locator?: string | null;
  confidence?: number | null;
}

export interface ApplyExtractedCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  clientId: string;
  fields: ExtractedField[];
}

const CONFIDENCE_THRESHOLD = 0.6;

function fieldText(f: ExtractedField): string | null {
  if (f.value_text && f.value_text.trim()) return f.value_text.trim();
  return null;
}
function fieldBool(f: ExtractedField): boolean | null {
  if (typeof f.value_bool === "boolean") return f.value_bool;
  const j = f.value_json as { bool?: unknown } | null | undefined;
  if (j && typeof j.bool === "boolean") return j.bool;
  if (f.value_text) {
    const v = f.value_text.trim().toLowerCase();
    if (["true", "yes", "y"].includes(v)) return true;
    if (["false", "no", "n"].includes(v)) return false;
  }
  return null;
}
function fieldArray(f: ExtractedField): string[] | null {
  if (Array.isArray(f.value_array) && f.value_array.length)
    return f.value_array.map((s) => s.trim()).filter(Boolean);
  const j = f.value_json as { array?: unknown } | null | undefined;
  if (j && Array.isArray(j.array))
    return (j.array as unknown[]).map((s) => String(s).trim()).filter(Boolean);
  if (f.value_text) {
    return f.value_text
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}
function fieldDate(f: ExtractedField): string | null {
  if (f.value_date && /^\d{4}-\d{2}-\d{2}/.test(f.value_date))
    return f.value_date.slice(0, 10);
  if (f.value_text && /^\d{4}-\d{2}-\d{2}/.test(f.value_text))
    return f.value_text.slice(0, 10);
  return null;
}

export async function applyExtractedFieldsToClient(
  ctx: ApplyExtractedCtx,
): Promise<{ autofilled: string[]; suggested: string[]; customCreated: string[] }> {
  const { supabase, organizationId, clientId, fields } = ctx;
  const autofilled: string[] = [];
  const suggested: string[] = [];
  const customCreated: string[] = [];


  const ok = fields.filter((f) => (f.confidence ?? 0) >= CONFIDENCE_THRESHOLD);
  const byKey = new Map<string, ExtractedField>();
  for (const f of ok) {
    if (!byKey.has(f.field_key)) byKey.set(f.field_key, f);
  }

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select(
      "id, first_name, last_name, date_of_birth, medicaid_id, phone_number, physical_address, emergency_contact_name, emergency_contact_phone, is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email, guardian_address, special_directions, allergies, dysphagia, swallowing_alerts, self_admin_med_support, pcsp_goals, authorized_dspd_codes, job_code, team_id",
    )
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!client) throw new Error("Client not found");

  const update: Record<string, unknown> = {};

  const setScalarText = (column: string, key: string) => {
    const f = byKey.get(key);
    if (!f) return;
    const v = fieldText(f);
    if (!v) return;
    const cur = (client as Record<string, unknown>)[column];
    if (cur === null || cur === undefined || cur === "") {
      update[column] = v;
      autofilled.push(column);
    } else if (cur !== v) {
      suggested.push(column);
    }
  };
  const setScalarBool = (column: string, key: string) => {
    const f = byKey.get(key);
    if (!f) return;
    const v = fieldBool(f);
    if (v === null) return;
    const cur = (client as Record<string, unknown>)[column];
    if (cur === null || cur === undefined || cur === false) {
      if (cur !== v) {
        update[column] = v;
        autofilled.push(column);
      }
    } else if (cur !== v) {
      suggested.push(column);
    }
  };
  const setScalarDate = (column: string, key: string) => {
    const f = byKey.get(key);
    if (!f) return;
    const v = fieldDate(f);
    if (!v) return;
    const cur = (client as Record<string, unknown>)[column];
    if (cur === null || cur === undefined || cur === "") {
      update[column] = v;
      autofilled.push(column);
    } else if (cur !== v) {
      suggested.push(column);
    }
  };
  const mergeArrayColumn = (column: string, additions: string[]) => {
    if (!additions.length) return;
    const cur = ((client as Record<string, unknown>)[column] as string[] | null) ?? [];
    const merged = Array.from(
      new Set([...cur, ...additions].map((s) => s.trim()).filter(Boolean)),
    );
    if (merged.length > cur.length) {
      update[column] = merged;
      autofilled.push(column);
    }
  };

  setScalarText("first_name", "first_name");
  setScalarText("last_name", "last_name");
  setScalarDate("date_of_birth", "dob");
  setScalarText("medicaid_id", "medicaid_id");
  setScalarText("phone_number", "phone");
  setScalarText("physical_address", "physical_address");
  setScalarText("emergency_contact_name", "emergency_contact_name");
  setScalarText("emergency_contact_phone", "emergency_contact_phone");

  const isOwn = byKey.get("is_own_guardian");
  const isOwnVal = isOwn ? fieldBool(isOwn) : null;
  if (isOwnVal === true) {
    if (client.is_own_guardian !== true) {
      update.is_own_guardian = true;
      autofilled.push("is_own_guardian");
    }
  } else {
    if (isOwnVal === false && client.is_own_guardian !== false) {
      update.is_own_guardian = false;
      autofilled.push("is_own_guardian");
    }
    setScalarText("guardian_name", "guardian_name");
    setScalarText("guardian_phone", "guardian_phone");
    setScalarText("guardian_relationship", "guardian_relationship");
    setScalarText("guardian_email", "guardian_email");
    setScalarText("guardian_address", "guardian_address");
  }

  setScalarText("special_directions", "clinical_alert");
  if (!update.special_directions) setScalarText("special_directions", "special_directions");
  setScalarBool("dysphagia", "dysphagia");
  setScalarBool("self_admin_med_support", "self_admin_med_support");

  const allergiesF = byKey.get("allergies");
  if (allergiesF) mergeArrayColumn("allergies", fieldArray(allergiesF) ?? []);
  const swallowF = byKey.get("swallowing_alerts");
  if (swallowF) mergeArrayColumn("swallowing_alerts", fieldArray(swallowF) ?? []);

  const goals = ok
    .filter((f) => f.field_key === "pcsp_goal")
    .map((f) => fieldText(f))
    .filter((s): s is string => !!s);
  if (goals.length) mergeArrayColumn("pcsp_goals", goals);

  // Billing-code rows
  const codeRows: Array<{
    service_code: string;
    rate?: number | null;
    max_units?: number | null;
    unit_type?: string | null;
    weekly_cap_units?: number | null;
    plan_start?: string | null;
    plan_end?: string | null;
  }> = [];
  for (const f of ok) {
    if (f.field_key === "billing_code_row" && f.value_json && typeof f.value_json === "object") {
      const row = f.value_json as Record<string, unknown>;
      if (row.service_code) {
        codeRows.push({
          service_code: String(row.service_code).toUpperCase(),
          rate: typeof row.rate === "number" ? row.rate : null,
          max_units: typeof row.max_units === "number" ? row.max_units : null,
          unit_type: row.unit_type ? String(row.unit_type) : null,
          weekly_cap_units:
            typeof row.weekly_cap_units === "number" ? row.weekly_cap_units : null,
          plan_start: row.plan_start ? String(row.plan_start).slice(0, 10) : null,
          plan_end: row.plan_end ? String(row.plan_end).slice(0, 10) : null,
        });
      }
    }
  }
  if (!codeRows.length) {
    const sc = byKey.get("service_code");
    if (sc && fieldText(sc)) {
      const rate = byKey.get("rate")?.value_number ?? null;
      const maxU = byKey.get("max_units")?.value_number ?? null;
      const ut = byKey.get("unit_type");
      const wcap = byKey.get("weekly_cap_units")?.value_number ?? null;
      codeRows.push({
        service_code: (fieldText(sc) as string).toUpperCase(),
        rate,
        max_units: maxU,
        unit_type: ut ? fieldText(ut) : null,
        weekly_cap_units: wcap,
        plan_start: byKey.get("plan_start") ? fieldDate(byKey.get("plan_start") as ExtractedField) : null,
        plan_end: byKey.get("plan_end") ? fieldDate(byKey.get("plan_end") as ExtractedField) : null,
      });
    }
  }

  if (codeRows.length) {
    const codes = Array.from(new Set(codeRows.map((r) => r.service_code)));
    mergeArrayColumn("authorized_dspd_codes", codes);
    mergeArrayColumn("job_code", codes);

    const { isDailyServiceCode } = await import("@/lib/service-billing");
    const stubs = codeRows.map((r) => ({
      organization_id: organizationId,
      client_id: clientId,
      service_code: r.service_code,
      unit_type: r.unit_type ?? (isDailyServiceCode(r.service_code) ? "day" : "unit"),
      annual_unit_authorization: r.max_units ?? 0,
      rate_per_unit: r.rate ?? 0,
      weekly_cap_units: r.weekly_cap_units ?? null,
      service_start_date: r.plan_start ?? null,
      service_end_date: r.plan_end ?? null,
    }));
    const { error: bcErr } = await supabase
      .from("client_billing_codes")
      .upsert(stubs, { onConflict: "organization_id,client_id,service_code" });
    if (bcErr) throw new Error(`billing-codes upsert failed: ${bcErr.message}`);
    autofilled.push(`client_billing_codes(${stubs.length})`);
  }

  // Team resolution by name → clients.team_id (non-destructive: only fills if empty).
  const teamF = byKey.get("team_name");
  const teamName = teamF ? fieldText(teamF) : null;
  if (teamName) {
    const cur = (client as Record<string, unknown>).team_id;
    if (cur === null || cur === undefined) {
      const { data: t } = await supabase
        .from("teams")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("team_name", teamName)
        .maybeSingle();
      if (t?.id) {
        update.team_id = t.id;
        autofilled.push("team_id");
      } else {
        suggested.push(`team_name (no match for "${teamName}")`);
      }
    }
  }

  if (Object.keys(update).length) {
    const { data: updated, error: uErr } = await supabase
      .from("clients")
      .update(update)
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .select("id");
    if (uErr) throw new Error(uErr.message);
    if (!updated || updated.length === 0)
      throw new Error("Client autofill update returned no rows");
  }

  // ── EVV: geocode the home address when we just set/changed it and the
  // client has no coordinates yet. Uses the SAME Nominatim helper the
  // per-client "Auto-geocoded on save" form uses. Never throws.
  const addrForGeo =
    (update.physical_address as string | undefined) ??
    (client.physical_address as string | null) ??
    null;
  if (addrForGeo && addrForGeo.trim()) {
    const { data: geoRow } = await supabase
      .from("clients")
      .select("home_latitude, home_longitude")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const hasCoords =
      geoRow &&
      geoRow.home_latitude !== null &&
      geoRow.home_latitude !== undefined;
    if (!hasCoords) {
      try {
        const { geocodeAddress } = await import("@/lib/geocode");
        const geo = await geocodeAddress(addrForGeo);
        if (geo) {
          const { error: gErr } = await supabase
            .from("clients")
            .update({ home_latitude: geo.lat, home_longitude: geo.lng })
            .eq("id", clientId)
            .eq("organization_id", organizationId);
          if (gErr) {
            suggested.push("Confirm home location for EVV");
          } else {
            autofilled.push("home_latitude");
            autofilled.push("home_longitude");
          }
        } else {
          suggested.push("Confirm home location for EVV");
        }
      } catch {
        suggested.push("Confirm home location for EVV");
      }
    }
  }


  // Staff ratio → client_ratios row (one per import, "default" setting).
  const ratioF = byKey.get("staff_ratio");
  const ratioText = ratioF ? fieldText(ratioF) : null;
  if (ratioText) {
    const m = /^\s*(\d+)\s*[:/x]\s*(\d+)\s*$/i.exec(ratioText);
    if (m) {
      const ratio_staff = parseInt(m[1], 10);
      const ratio_clients = parseInt(m[2], 10);
      const today = new Date().toISOString().slice(0, 10);
      const { error: rErr } = await supabase.from("client_ratios").insert({
        organization_id: organizationId,
        client_id: clientId,
        setting: "default",
        ratio_staff,
        ratio_clients,
        effective_start: today,
      });
      if (!rErr) autofilled.push(`client_ratios(${ratio_staff}:${ratio_clients})`);
    } else {
      suggested.push(`staff_ratio (unparseable "${ratioText}")`);
    }
  }

  // Anything we don't have a clients column for → custom field, so nothing
  // extracted is lost and each agency builds its own field library.
  const KNOWN_CORE = new Set<string>([
    "first_name", "last_name", "dob", "medicaid_id", "phone",
    "physical_address", "emergency_contact_name", "emergency_contact_phone",
    "is_own_guardian", "guardian_name", "guardian_phone", "guardian_relationship",
    "guardian_email", "guardian_address",
    "clinical_alert", "special_directions", "dysphagia", "self_admin_med_support",
    "allergies", "swallowing_alerts", "pcsp_goal",
    "billing_code_row", "service_code", "rate", "max_units", "unit_type",
    "weekly_cap_units", "plan_start", "plan_end",
    "team_name", "staff_ratio",
  ]);
  const seenCustom = new Set<string>();
  for (const f of ok) {
    if (KNOWN_CORE.has(f.field_key)) continue;
    if (seenCustom.has(f.field_key)) continue;
    seenCustom.add(f.field_key);
    const val = fieldText(f) ?? (fieldArray(f)?.join(", ") ?? null);
    if (!val) continue;
    try {
      const { data: def } = await supabase
        .from("custom_field_definitions")
        .upsert(
          {
            organization_id: organizationId,
            entity_kind: "client",
            field_key: f.field_key,
            field_label: f.field_key.replace(/_/g, " "),
            data_type: "text",
            source: "import",
          },
          { onConflict: "organization_id,entity_kind,field_key" },
        )
        .select("id")
        .single();
      if (!def) continue;
      const { data: existing } = await supabase
        .from("custom_field_values")
        .select("id")
        .eq("definition_id", def.id)
        .eq("entity_id", clientId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("custom_field_values")
          .update({ value_text: val })
          .eq("id", existing.id);
      } else {
        await supabase.from("custom_field_values").insert({
          organization_id: organizationId,
          definition_id: def.id,
          entity_id: clientId,
          entity_kind: "client",
          value_text: val,
        });
      }
      customCreated.push(f.field_key);
    } catch {
      // Non-fatal: surface as a soft suggestion instead of blocking the commit.
      suggested.push(`custom:${f.field_key}`);
    }
  }

  // ── Tracked-field unknown sweep ─────────────────────────────────────────
  // For each field we explicitly track, if it has no real data AND no
  // existing confirmation, flag it "unknown" in clients.field_confirmations
  // and queue a NECTAR question in `suggested`. Never guesses.
  try {
    const { TRACKED_FIELDS } = await import("@/lib/field-confirmations");
    const { data: cur } = await supabase
      .from("clients")
      .select(
        "allergies, dysphagia, swallowing_alerts, special_directions, is_own_guardian, guardian_name, field_confirmations",
      )
      .eq("id", clientId)
      .maybeSingle();
    if (cur) {
      const { count: medCount } = await supabase
        .from("client_medications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("is_active", true);

      // Custom-field-backed tracked fields.
      const builtIn = new Set([
        "medications", "allergies", "dysphagia", "swallowing_alerts",
        "clinical_alert", "guardian",
      ]);
      const customKeys = TRACKED_FIELDS
        .map((f: { key: string }) => f.key)
        .filter((k: string) => !builtIn.has(k));
      const { data: defs } = await supabase
        .from("custom_field_definitions")
        .select("id, field_key")
        .eq("organization_id", organizationId)
        .eq("entity_kind", "client")
        .in("field_key", customKeys);
      const defIds = ((defs ?? []) as Array<{ id: string; field_key: string }>).map((d) => d.id);
      const { data: vals } = defIds.length
        ? await supabase
            .from("custom_field_values")
            .select("definition_id, value_text, value_boolean")
            .eq("entity_id", clientId)
            .in("definition_id", defIds)
        : { data: [] as Array<{ definition_id: string; value_text: string | null; value_boolean: boolean | null }> };
      const keyByDef = new Map(
        ((defs ?? []) as Array<{ id: string; field_key: string }>).map((d) => [d.id, d.field_key]),
      );
      const customHas = new Set<string>();
      for (const v of (vals ?? []) as Array<{ definition_id: string; value_text: string | null; value_boolean: boolean | null }>) {
        const key = keyByDef.get(v.definition_id);
        if (!key) continue;
        if ((v.value_text && v.value_text.trim().length) || v.value_boolean === true) customHas.add(key);
      }

      const hasMap: Record<string, boolean> = {
        medications: (medCount ?? 0) > 0,
        allergies: Array.isArray(cur.allergies) && cur.allergies.length > 0,
        dysphagia: cur.dysphagia === true,
        swallowing_alerts: Array.isArray(cur.swallowing_alerts) && cur.swallowing_alerts.length > 0,
        clinical_alert: !!(cur.special_directions && String(cur.special_directions).trim()),
        guardian:
          cur.is_own_guardian === true ||
          (cur.is_own_guardian === false && !!cur.guardian_name?.trim()),
      };
      for (const k of customKeys) hasMap[k] = customHas.has(k);

      const existing = (cur.field_confirmations as Record<string, string> | null) ?? {};
      const next: Record<string, string> = { ...existing };
      let changed = false;
      for (const f of TRACKED_FIELDS) {
        if (hasMap[f.key]) continue;
        if (existing[f.key]) continue;
        next[f.key] = "unknown";
        changed = true;
        suggested.push(`Confirm: ${(f as { question: string }).question}`);
      }
      if (changed) {
        await supabase
          .from("clients")
          .update({ field_confirmations: next })
          .eq("id", clientId);
      }
    }
  } catch {
    // Non-fatal — confirmation sweep is advisory.
  }

  return { autofilled, suggested, customCreated };
}
