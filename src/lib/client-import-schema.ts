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

export type SourceDocumentType =
  | "pcsp"
  | "1056_budget"
  | "mar"
  | "bsp"
  | "immunization"
  | "allergy"
  | "dnr"
  | "polst"
  | "palliative"
  | "hospice"
  | "other";

export interface ApplyExtractedCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  clientId: string;
  fields: ExtractedField[];
  /** Authoritative source for per-domain conflict resolution. Optional. */
  sourceDocumentType?: SourceDocumentType;
  /** Optional importJob context so merge flags and audit rows can link back. */
  importJobId?: string | null;
  /** Optional audit hook — called for every silently-handled error. */
  onError?: (action: string, message: string) => Promise<void> | void;
}

const CONFIDENCE_THRESHOLD = 0.6;

function fieldText(f: ExtractedField): string | null {
  if (f.value_text && f.value_text.trim()) return f.value_text.trim();
  // Rescue: AI sometimes places single-value text into value_array (e.g. one
  // goal as ["Independent meal prep"]). Treat the joined array as the text.
  if (Array.isArray(f.value_array) && f.value_array.length) {
    const joined = f.value_array.map((s) => String(s).trim()).filter(Boolean).join("; ");
    if (joined) return joined;
  }
  // Rescue: value_json may carry { text: "..." } or a string.
  if (typeof f.value_json === "string" && f.value_json.trim()) return f.value_json.trim();
  const j = f.value_json as { text?: unknown } | null | undefined;
  if (j && typeof j.text === "string" && j.text.trim()) return j.text.trim();
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

// Forgiving numeric coercion — AI often returns "$18.50" or "3,120" as a
// string even when the prompt asks for a number. Returns null when no real
// number can be recovered; never returns NaN.
function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function applyExtractedFieldsToClient(
  ctx: ApplyExtractedCtx,
): Promise<{ autofilled: string[]; suggested: string[]; customCreated: string[] }> {
  const { supabase, organizationId, clientId, fields } = ctx;
  const sourceDocumentType = ctx.sourceDocumentType ?? null;
  const importJobId = ctx.importJobId ?? null;
  const autofilled: string[] = [];
  const suggested: string[] = [];
  const customCreated: string[] = [];

  const onError = async (action: string, message: string) => {
    try {
      if (ctx.onError) await ctx.onError(action, message);
    } catch { /* never let an audit failure break a save */ }
  };

  const writeScalarConflict = async (
    field: string,
    existing: unknown,
    incoming: unknown,
  ) => {
    try {
      await supabase.from("import_merge_flags").insert({
        organization_id: organizationId,
        client_id: clientId,
        import_job_id: importJobId,
        field,
        kind: "scalar_conflict",
        existing_value: existing == null ? null : String(existing).slice(0, 4000),
        incoming_value: incoming == null ? null : String(incoming).slice(0, 4000),
        suggested_value: incoming == null ? null : String(incoming).slice(0, 4000),
        source_document_type: sourceDocumentType,
      });
    } catch (e) {
      await onError("merge_flag_insert_error", (e as Error).message);
    }
  };

  const writeDuplicateFlag = async (field: string, existing: string, incoming: string) => {
    try {
      await supabase.from("import_merge_flags").insert({
        organization_id: organizationId,
        client_id: clientId,
        import_job_id: importJobId,
        field,
        kind: "possible_duplicate",
        existing_value: existing.slice(0, 4000),
        incoming_value: incoming.slice(0, 4000),
        source_document_type: sourceDocumentType,
      });
    } catch (e) {
      await onError("merge_flag_insert_error", (e as Error).message);
    }
  };



  const ok = fields.filter((f) => (f.confidence ?? 0) >= CONFIDENCE_THRESHOLD);
  const byKey = new Map<string, ExtractedField>();
  for (const f of ok) {
    if (!byKey.has(f.field_key)) byKey.set(f.field_key, f);
  }

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select(
      "id, first_name, last_name, date_of_birth, medicaid_id, phone_number, physical_address, " +
      "emergency_contact_name, emergency_contact_phone, emergency_contact_instructions, " +
      "is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email, guardian_address, " +
      "special_directions, allergies, dysphagia, swallowing_alerts, self_admin_med_support, " +
      "pcsp_goals, authorized_dspd_codes, job_code, team_id, " +
      "support_coordinator_name, support_coordinator_email, support_coordinator_phone, " +
      "primary_care_name, primary_care_phone, " +
      "neurologist_name, neurologist_phone, " +
      "dentist_name, dentist_phone, " +
      "prescriber_name, prescriber_phone, " +
      "bsp_status, medical_insurance, housing_voucher, preferred_living, " +
      "plan_year, disability_category, staff_ratio, level_of_need, " +
      "advanced_directives, emergency_medical_treatment_authorization, " +
      "diagnoses, chronic_conditions, immunizations, court_orders, rights_restrictions, " +
      "preferred_activities, roommates, personal_belongings_inventory, " +
      "emergency_contact_2_name, emergency_contact_2_phone, emergency_contact_2_instructions, " +
      "grievance_acknowledged, grievance_signed_date, " +
      "dnr_status, dnr_location, polst_status, palliative_care_status, hospice_status, " +
      "admission_date, discharge_date, form_1056_number, form_1056_approved_date",
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
      // Surface as a structured merge flag for admin review.
      void writeScalarConflict(column, cur, v);
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
      void writeScalarConflict(column, cur, v);
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
      void writeScalarConflict(column, cur, v);
    }
  };

  // Lightweight token-set Jaccard for "is this the same item, worded differently?".
  const tokenize = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 2),
    );
  const looksDuplicate = (a: string, b: string): boolean => {
    const al = a.trim().toLowerCase();
    const bl = b.trim().toLowerCase();
    if (al === bl) return false; // exact dupe is already collapsed by Set()
    if (al.includes(bl) || bl.includes(al)) return true;
    const ta = tokenize(a);
    const tb = tokenize(b);
    if (ta.size === 0 || tb.size === 0) return false;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    return union > 0 && inter / union >= 0.6;
  };

  const mergeArrayColumn = (column: string, additions: string[]) => {
    if (!additions.length) return;
    const cur = ((client as Record<string, unknown>)[column] as string[] | null) ?? [];
    // Detect possible duplicates against the existing list before unioning.
    for (const add of additions) {
      for (const existing of cur) {
        if (looksDuplicate(existing, add)) {
          void writeDuplicateFlag(column, existing, add);
        }
      }
    }
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

  // Support coordinator
  setScalarText("support_coordinator_name", "support_coordinator_name");
  setScalarText("support_coordinator_email", "support_coordinator_email");
  setScalarText("support_coordinator_phone", "support_coordinator_phone");

  // Medical providers
  setScalarText("primary_care_name", "primary_care_name");
  setScalarText("primary_care_phone", "primary_care_phone");
  setScalarText("neurologist_name", "neurologist_name");
  setScalarText("neurologist_phone", "neurologist_phone");
  setScalarText("dentist_name", "dentist_name");
  setScalarText("dentist_phone", "dentist_phone");
  setScalarText("prescriber_name", "prescriber_name");
  setScalarText("prescriber_phone", "prescriber_phone");

  // Medical / compliance
  setScalarText("bsp_status", "bsp_status");
  setScalarText("medical_insurance", "medical_insurance");
  setScalarText("housing_voucher", "housing_voucher");
  setScalarText("preferred_living", "preferred_living");
  setScalarText("emergency_contact_instructions", "emergency_contact_instructions");
  setScalarText("emergency_contact_2_name", "emergency_contact_2_name");
  setScalarText("emergency_contact_2_phone", "emergency_contact_2_phone");
  setScalarText("emergency_contact_2_instructions", "emergency_contact_2_instructions");
  setScalarText("plan_year", "plan_year");
  setScalarText("disability_category", "disability_category");
  setScalarText("staff_ratio", "staff_ratio");
  setScalarText("level_of_need", "level_of_need");

  // End-of-life / advanced care — extractor maps real document wording onto
  // these columns. Status values stay as-extracted (e.g. "Active", "On file");
  // the EOL UI normalizes "none" vs anything-else.
  setScalarText("dnr_status", "dnr_status");
  setScalarText("dnr_location", "dnr_location");
  setScalarText("polst_status", "polst_status");
  setScalarText("palliative_care_status", "palliative_care_status");
  setScalarText("hospice_status", "hospice_status");

  // Booleans
  setScalarBool("advanced_directives", "advanced_directives");
  setScalarBool("emergency_medical_treatment_authorization", "emergency_medical_treatment_authorization");
  setScalarBool("grievance_acknowledged", "grievance_acknowledged");
  setScalarDate("grievance_signed_date", "grievance_signed_date");

  // Array columns
  const diagnosesF = byKey.get("diagnoses");
  if (diagnosesF) mergeArrayColumn("diagnoses", fieldArray(diagnosesF) ?? []);
  const chronicF = byKey.get("chronic_conditions");
  if (chronicF) mergeArrayColumn("chronic_conditions", fieldArray(chronicF) ?? []);
  const immunF = byKey.get("immunizations");
  if (immunF) mergeArrayColumn("immunizations", fieldArray(immunF) ?? []);
  const courtF = byKey.get("court_orders");
  if (courtF) mergeArrayColumn("court_orders", fieldArray(courtF) ?? []);
  const rightsF = byKey.get("rights_restrictions");
  if (rightsF) mergeArrayColumn("rights_restrictions", fieldArray(rightsF) ?? []);
  const activitiesF = byKey.get("preferred_activities");
  if (activitiesF) mergeArrayColumn("preferred_activities", fieldArray(activitiesF) ?? []);
  const roommatesF = byKey.get("roommates");
  if (roommatesF) mergeArrayColumn("roommates", fieldArray(roommatesF) ?? []);
  const belongingsF = byKey.get("personal_belongings_inventory");
  if (belongingsF) mergeArrayColumn("personal_belongings_inventory", fieldArray(belongingsF) ?? []);

  // SOW §1.10 required dates
  setScalarDate("admission_date", "admission_date");
  setScalarDate("discharge_date", "discharge_date");

  // 1056 (DSPD Service Authorization Form) — header fields.
  setScalarText("form_1056_number", "form_1056_number");
  setScalarDate("form_1056_approved_date", "form_1056_approved_date");

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
          rate: toNum(row.rate),
          max_units: toNum(row.max_units),
          unit_type: row.unit_type ? String(row.unit_type) : null,
          weekly_cap_units: toNum(row.weekly_cap_units),
          plan_start: row.plan_start ? String(row.plan_start).slice(0, 10) : null,
          plan_end: row.plan_end ? String(row.plan_end).slice(0, 10) : null,
        });
      }
    }
  }
  if (!codeRows.length) {
    const sc = byKey.get("service_code");
    if (sc && fieldText(sc)) {
      const rateF = byKey.get("rate");
      const maxF = byKey.get("max_units");
      const wcapF = byKey.get("weekly_cap_units");
      const ut = byKey.get("unit_type");
      codeRows.push({
        service_code: (fieldText(sc) as string).toUpperCase(),
        rate: rateF ? toNum(rateF.value_number ?? rateF.value_text) : null,
        max_units: maxF ? toNum(maxF.value_number ?? maxF.value_text) : null,
        unit_type: ut ? fieldText(ut) : null,
        weekly_cap_units: wcapF ? toNum(wcapF.value_number ?? wcapF.value_text) : null,
        plan_start: byKey.get("plan_start") ? fieldDate(byKey.get("plan_start") as ExtractedField) : null,
        plan_end: byKey.get("plan_end") ? fieldDate(byKey.get("plan_end") as ExtractedField) : null,
      });
    }
  }

  if (codeRows.length) {
    const codes = Array.from(new Set(codeRows.map((r) => r.service_code)));
    // Only PCSP and 1056 are authoritative for the active code SET. Other
    // document types (MAR, BSP, immunization, allergy, end-of-life docs) must
    // NEVER touch authorized_dspd_codes / job_code, even if a stray
    // billing_code_row leaks through.
    const isAuthoritative =
      sourceDocumentType === null || // legacy callers (no type) keep prior behavior
      sourceDocumentType === "pcsp" ||
      sourceDocumentType === "1056_budget";

    if (isAuthoritative) {
      const curCodes = ((client as Record<string, unknown>).authorized_dspd_codes as string[] | null) ?? [];
      const sameSet = curCodes.length === codes.length && curCodes.every((c) => codes.includes(c));
      if (!sameSet) {
        update.authorized_dspd_codes = codes;
        autofilled.push("authorized_dspd_codes");
      }
      update.job_code = codes;
    }

    const { isDailyServiceCode } = await import("@/lib/service-billing");

    // Authoritative-source rule for UNITS: the 1056 wins. A PCSP may seed
    // units only when no prior authorization row exists; the 1056 always
    // overwrites annual_unit_authorization for the codes it lists.
    // Pull current rows so we know which (org, client, service_code) exist.
    const { data: existingForUnits } = await supabase
      .from("client_billing_codes")
      .select("service_code, annual_unit_authorization")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId);
    const existingByCode = new Map<string, number | null>(
      ((existingForUnits ?? []) as Array<{ service_code: string; annual_unit_authorization: number | null }>)
        .map((r) => [r.service_code, r.annual_unit_authorization]),
    );

    const stubs = codeRows.map((r) => {
      const prior = existingByCode.get(r.service_code) ?? null;
      let annual: number | null = r.max_units ?? null;
      if (sourceDocumentType === "1056_budget") {
        // 1056 wins for units — always overwrite when it provides a value.
        annual = r.max_units ?? prior ?? 0;
      } else if (sourceDocumentType === "pcsp") {
        // PCSP only fills units when none are on file (or were zero).
        annual = (prior && prior > 0) ? prior : (r.max_units ?? 0);
        if (r.max_units && prior && prior > 0 && r.max_units !== prior) {
          void writeScalarConflict(
            `client_billing_codes.${r.service_code}.annual_unit_authorization`,
            prior,
            r.max_units,
          );
        }
      } else {
        annual = r.max_units ?? prior ?? 0;
      }
      return {
        organization_id: organizationId,
        client_id: clientId,
        service_code: r.service_code,
        unit_type: r.unit_type ?? (isDailyServiceCode(r.service_code) ? "day" : "unit"),
        annual_unit_authorization: annual ?? 0,
        rate_per_unit: r.rate ?? 0,
        weekly_cap_units: r.weekly_cap_units ?? null,
        service_start_date: r.plan_start ?? null,
        service_end_date: r.plan_end ?? null,
      };
    });
    const { error: bcErr } = await supabase
      .from("client_billing_codes")
      .upsert(stubs, { onConflict: "organization_id,client_id,service_code" });
    if (bcErr) throw new Error(`billing-codes upsert failed: ${bcErr.message}`);
    autofilled.push(`client_billing_codes(${stubs.length})`);

    // Close any existing authorization rows for codes NOT in the new doc.
    // Only authoritative documents (PCSP / 1056) ever close stale rows.
    if (isAuthoritative) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: existingCodeRows } = await supabase
        .from("client_billing_codes")
        .select("id, service_code, service_end_date")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId);
      const stale = (existingCodeRows ?? []).filter(
        (r: { service_code: string; service_end_date: string | null }) =>
          !codes.includes(r.service_code) &&
          (!r.service_end_date || r.service_end_date > today),
      );
      for (const r of stale) {
        await supabase
          .from("client_billing_codes")
          .update({ service_end_date: today })
          .eq("id", (r as { id: string }).id);
        suggested.push(`Closed stale auth: ${(r as { service_code: string }).service_code}`);
      }
    }
  }

  // ── Medications signal → auto-toggle MAR/eMAR ───────────────────────────
  // The PCSP is authoritative on whether the client has prescribed meds.
  // - If the document explicitly says "no medications" (pcsp_has_medications=false)
  //   AND no client_medication rows were extracted, turn the feature OFF.
  // - If any medication was extracted, leave the feature ON (default).
  // Skips clients that already have client_medications rows on file, so we
  // never disable MAR for a client who actually has meds tracked elsewhere.
  try {
    const medRows = ok.filter((f) => f.field_key === "client_medication");
    const hasMedsFlag = (() => {
      const f = byKey.get("pcsp_has_medications");
      return f ? fieldBool(f) : null;
    })();
    const { count: existingMedCount } = await supabase
      .from("client_medications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .eq("is_active", true);
    const hasExistingMeds = (existingMedCount ?? 0) > 0;

    if (medRows.length === 0 && hasMedsFlag === false && !hasExistingMeds) {
      const { data: cRow } = await supabase
        .from("clients")
        .select("feature_config")
        .eq("id", clientId)
        .maybeSingle();
      const fc = (cRow?.feature_config ?? {}) as Record<string, boolean>;
      if (fc.emar !== false) {
        fc.emar = false;
        await supabase
          .from("clients")
          .update({ feature_config: fc })
          .eq("id", clientId)
          .eq("organization_id", organizationId);
        autofilled.push("feature_config.emar=off (no medications in PCSP)");
      }
    }
  } catch (err) {
    // Non-fatal — auto-toggle is advisory, but never silent: audit it.
    await onError("medications_signal_error", (err as Error).message);
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
            await onError("geocode_update_error", gErr.message);
          } else {
            autofilled.push("home_latitude");
            autofilled.push("home_longitude");
          }
        } else {
          suggested.push("Confirm home location for EVV");
        }
      } catch (err) {
        suggested.push("Confirm home location for EVV");
        await onError("geocode_lookup_error", (err as Error).message);
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
      if (rErr) {
        // Used to silently swallow → caused the staff_ratio debugging session.
        suggested.push(`staff_ratio (db error: ${rErr.message})`);
        await onError("client_ratios_insert_error", rErr.message);
      } else {
        autofilled.push(`client_ratios(${ratio_staff}:${ratio_clients})`);
      }
    } else {
      suggested.push(`staff_ratio (unparseable "${ratioText}")`);
      await onError("staff_ratio_unparseable", `"${ratioText}"`);
    }
  }

  // ── Registry-driven pass for custom-backed profile fields ──────────────
  // Bind extraction → store under the SAME keys the wizard / profile read
  // back. Any extracted field matching a registry custom field's `key` or
  // one of its `extractionKeys` is persisted via writeProfileFieldValue.
  const {
    CLIENT_PROFILE_FIELDS,
    writeProfileFieldValue,
  } = await import("@/lib/client-profile-fields");
  const registryConsumed = new Set<string>();
  for (const field of CLIENT_PROFILE_FIELDS) {
    if (field.storage.kind !== "custom") continue;
    const aliasKeys = [field.key, ...(field.extractionKeys ?? [])];
    let chosen: ExtractedField | null = null;
    for (const k of aliasKeys) {
      const f = byKey.get(k);
      if (f) { chosen = f; break; }
    }
    if (!chosen) continue;
    let value: string | boolean | string[] | null = null;
    if (field.type === "bool") value = fieldBool(chosen);
    else if (field.type === "array") value = fieldArray(chosen);
    else value = fieldText(chosen);
    if (value == null || (Array.isArray(value) && value.length === 0) ||
        (typeof value === "string" && value.trim().length === 0)) {
      continue;
    }
    try {
      await writeProfileFieldValue(supabase, organizationId, clientId, field, value);
      for (const k of aliasKeys) registryConsumed.add(k);
      customCreated.push(field.key);
    } catch (err) {
      suggested.push(`custom:${field.key} (${(err as Error).message})`);
      await onError("custom_field_registry_error", `${field.key}: ${(err as Error).message}`);
    }
  }

  // Anything else without a clients column → generic custom field so nothing
  // extracted is lost. Unknown keys are logged once so we can detect future drops.
  const KNOWN_CORE = new Set<string>([
    "first_name", "last_name", "full_name", "dob", "medicaid_id", "phone",
    "physical_address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_instructions",
    "is_own_guardian", "guardian_name", "guardian_phone", "guardian_relationship",
    "guardian_email", "guardian_address",
    "clinical_alert", "special_directions", "dysphagia", "self_admin_med_support",
    "allergies", "swallowing_alerts", "pcsp_goal",
    "billing_code_row", "service_code", "rate", "max_units", "unit_type",
    "weekly_cap_units", "plan_start", "plan_end",
    "team_name", "staff_ratio",
    "client_medication", "pcsp_has_medications",
    // Support coordinator
    "support_coordinator_name", "support_coordinator_email", "support_coordinator_phone",
    // Medical providers
    "primary_care_name", "primary_care_phone",
    "neurologist_name", "neurologist_phone",
    "dentist_name", "dentist_phone",
    "prescriber_name", "prescriber_phone",
    // Medical / compliance
    "bsp_status", "medical_insurance", "housing_voucher", "preferred_living",
    "plan_year", "disability_category",
    "advanced_directives", "emergency_medical_treatment_authorization",
    // Array columns
    "diagnoses", "chronic_conditions", "immunizations",
    "court_orders", "rights_restrictions",
    "preferred_activities", "roommates", "personal_belongings_inventory",
    // SOW §1.10 dates
    "admission_date", "discharge_date",
    // 1056 header fields
    "form_1056_number", "form_1056_approved_date",
    // SOW supplemental
    "level_of_need",
    "emergency_contact_2_name", "emergency_contact_2_phone", "emergency_contact_2_instructions",
    "grievance_acknowledged", "grievance_signed_date",
    // End-of-life / advanced care
    "dnr_status", "dnr_location", "polst_status", "palliative_care_status", "hospice_status",
  ]);
  const seenCustom = new Set<string>();
  for (const f of ok) {
    if (KNOWN_CORE.has(f.field_key)) continue;
    if (registryConsumed.has(f.field_key)) continue;
    if (seenCustom.has(f.field_key)) continue;
    seenCustom.add(f.field_key);
    console.warn(`[client-import] unmapped field_key "${f.field_key}" — routing to custom field`);
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
    } catch (err) {
      // Non-fatal: surface as a soft suggestion AND audit so it can't vanish.
      suggested.push(`custom:${f.field_key}`);
      await onError("custom_field_unknown_error", `${f.field_key}: ${(err as Error).message}`);
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
  } catch (err) {
    await onError("confirmation_sweep_error", (err as Error).message);
  }

  return { autofilled, suggested, customCreated };
}
