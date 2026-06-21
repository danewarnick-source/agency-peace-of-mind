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
      "id, first_name, last_name, date_of_birth, medicaid_id, phone_number, physical_address, emergency_contact_name, emergency_contact_phone, is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email, guardian_address, special_directions, allergies, dysphagia, swallowing_alerts, self_admin_med_support, pcsp_goals, authorized_dspd_codes, job_code",
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

  return { autofilled, suggested };
}
