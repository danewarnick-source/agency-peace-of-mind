// =============================================================
// Shared document extractor — used by BOTH the per-client
// uploader (src/lib/nectar-documents.functions.ts) and Smart
// Import (src/lib/smart-import.functions.ts). One prompt, one
// schema, one parser. Field keys here MUST match the keys that
// applyExtractedFieldsToClient consumes in client-import-schema.ts.
// =============================================================

import { z } from "zod";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

export const FieldOut = z.object({
  field_key: z.string().min(1).max(80),
  field_group: z.string().max(80).optional().nullable(),
  value_text: z.string().max(2000).optional().nullable(),
  value_number: z.number().optional().nullable(),
  value_date: z.string().max(40).optional().nullable(),
  value_bool: z.boolean().optional().nullable(),
  value_array: z.array(z.string().max(500)).max(50).optional().nullable(),
  value_json: z.any().optional().nullable(),
  source_locator: z.string().max(200).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});
export type ExtractedFieldOut = z.infer<typeof FieldOut>;

export const ParseOut = z.object({
  document_type: z.string().max(40).optional().nullable(),
  fiscal_year: z.string().max(20).optional().nullable(),
  effective_start: z.string().max(40).optional().nullable(),
  effective_end: z.string().max(40).optional().nullable(),
  medicaid_id: z.string().max(50).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  fields: z.array(FieldOut).max(500).default([]),
});
export type ParseOutT = z.infer<typeof ParseOut>;

// The canonical set of field_keys the extractor is expected to produce
// for client documents. applyExtractedFieldsToClient reads these names
// directly; Smart Import uses this set to know what is NOT a custom
// attribute. Keep in lockstep with client-import-schema.ts.
export const CORE_CLIENT_FIELD_KEYS = new Set<string>([
  // Person
  "first_name", "last_name", "full_name", "dob", "medicaid_id", "phone", "plan_year",
  "disability_category", "admission_date", "discharge_date",
  // Address
  "physical_address",
  // Emergency contact (split, never one blob) — primary + secondary
  "emergency_contact_name", "emergency_contact_phone", "emergency_contact_instructions",
  "emergency_contact_2_name", "emergency_contact_2_phone", "emergency_contact_2_instructions",
  // Guardian
  "is_own_guardian", "guardian_name", "guardian_phone",
  "guardian_relationship", "guardian_email", "guardian_address",
  // Goals — ONE field per goal
  "pcsp_goal",
  // Health
  "allergies", "dysphagia", "swallowing_alerts", "self_admin_med_support",
  "clinical_alert", "special_directions",
  // Medications — ONE field per medication + an overall presence boolean
  "client_medication", "pcsp_has_medications",
  // Billing — ONE field per authorized service code
  "billing_code_row",
  // 1056 (DSPD Service Authorization Form)
  "form_1056_number", "form_1056_approved_date",
  // Support coordinator
  "support_coordinator_name", "support_coordinator_email", "support_coordinator_phone",
  // Medical
  "primary_care_name", "primary_care_phone",
  "neurologist_name", "neurologist_phone",
  "dentist_name", "dentist_phone",
  "prescriber_name", "prescriber_phone",
  "medical_insurance",
  "diagnoses", "chronic_conditions", "immunizations",
  "emergency_medical_treatment_authorization", "advanced_directives",
  // Rights / behavior / end-of-life
  "rights_restrictions", "bsp_status",
  "dnr_status", "dnr_location", "polst_status", "palliative_care_status", "hospice_status",
  // SOW supplemental
  "grievance_acknowledged", "grievance_signed_date",
  // Service plan
  "staff_ratio", "preferred_activities", "preferred_living", "roommates",
  "housing_voucher", "court_orders", "personal_belongings_inventory",
  "team_name",
  // PCSP additions
  "mailing_address", "support_coordinator_company", "representative_payee",
  // Per-goal context
  "goal_domain", "goal_current_status", "goal_strengths", "goal_barriers", "goal_success_criteria",
]);

export const SYSTEM_PROMPT = `You are NECTAR, an extraction engine for a Utah DSPD provider compliance platform (HIVE).
You receive raw text from a document (PCSP, 1056 budget, SOW, referral, intake, assessment, certification, contract, etc.).
Take your time. Accuracy is more important than speed. Extract EVERY field that appears in the document.

OUTPUT CONTRACT — Return STRICT JSON only, using exactly this envelope:
{
  "document_type": "pcsp",
  "fiscal_year": "FY26",
  "medicaid_id": "1029384756",
  "title": "Person-Centered Support Plan",
  "fields": [
    { "field_key": "first_name", "field_group": "person", "value_text": "Marcus", "confidence": 0.95 },
    { "field_key": "last_name",  "field_group": "person", "value_text": "Rivera", "confidence": 0.95 },
    { "field_key": "medicaid_id","field_group": "person", "value_text": "1029384756", "confidence": 0.95 },
    { "field_key": "billing_code_row", "field_group": "billing_code",
      "value_json": { "service_code": "SLH", "unit_type": "15 min", "max_units": 5000 }, "confidence": 0.9 }
  ]
}

Return a single JSON object with a top-level array named fields. EVERY extracted field — person, address, guardian, goals, medications, billing codes — MUST be an element of fields. Do not nest fields under any other key, do not return a bare array, do not group fields by category at the top level.

Use these conventions:

document_type: one of pcsp | 1056_budget | sow | referral | intake | assessment | certification | training | contract | evv_report | timesheet | incident_report | billing_record | other
fiscal_year: e.g. "FY26"
effective_start / effective_end: ISO yyyy-mm-dd
medicaid_id: digits only if present
title: the document title/name if present (for example "Person-Centered Support Plan" or "Service Authorization")

Each extracted field has: field_key, field_group, optional value_text / value_number / value_date / value_bool / value_array / value_json, source_locator, confidence (0..1).
- Dates in value_date as ISO yyyy-mm-dd.
- Booleans in value_bool.
- Short string lists (allergies, diagnoses, chronic_conditions, swallowing_alerts, immunizations, preferred_activities, roommates, personal_belongings_inventory) in value_array — NEVER joined into one string.
- Structured rows (per-code billing authorizations) in value_json.

Common field_key values to extract when present (use field_group to bucket related fields):
  Person (group "person"): first_name, last_name, dob (value_date), medicaid_id, phone, plan_year,
    disability_category (value_text: exactly "ID-RC" or "ABI" — read from the population/diagnosis
    section of the PCSP; ID-RC = Intellectual Disability / Related Condition, ABI = Acquired Brain
    Injury; omit this field entirely if the document does not state the population),
    admission_date (value_date — SOW §1.10 required; use the service/plan begin date if no explicit
    admission date is present; omit if not present in any form),
    discharge_date (value_date — usually absent on intake; omit if not present).
    IMPORTANT: a PCSP labels the client's Medicaid number as "PID:" or "Person ID:". Treat these
    labels as Medicaid ID and extract the value into medicaid_id (digits only). Do NOT emit a
    separate PID/person_id field — there is no such column.
  Address (group "address"): physical_address  -- client's Residential Address (service/home street).
    mailing_address (value_text) -- the client's Mailing Address when listed separately on the PCSP.
  Emergency contact (group "emergency_contact"): emergency_contact_name, emergency_contact_phone, emergency_contact_instructions.
    ALWAYS split name and phone into TWO separate fields. Never combine.
    If a SECOND emergency contact is listed, emit emergency_contact_2_name,
    emergency_contact_2_phone, emergency_contact_2_instructions for that person.
  Guardian (group "guardian"): is_own_guardian (value_bool), guardian_name, guardian_phone,
    guardian_relationship, guardian_email, guardian_address.
    CRITICAL: a "Representative Payee" / "Rep Payee" is a FINANCIAL arrangement, NOT a legal
    guardian. NEVER place rep-payee names, phones, or addresses into guardian_* fields. If a rep
    payee is listed, emit a separate field representative_payee (group "finance", value_text)
    with the named person or entity.
  Grievance acknowledgment (group "rights"): grievance_acknowledged (value_bool true) and
    grievance_signed_date (value_date) when the document is a SIGNED grievance-policy
    acknowledgment form (SOW §1.10(11)). Omit unless explicitly signed.
  Goals (group "goals"): pcsp_goal -- emit ONE field per distinct goal/objective in value_text.
    PCSP goals often appear in a table (Goal / Objective / Support Code). Emit one pcsp_goal
    per ROW, not one combined entry. When the PCSP supplies per-goal context, ALSO emit any of
    these as value_text fields (group "goals"): goal_domain (e.g. "Community Living",
    "Healthy Living", "Safety"), goal_current_status, goal_strengths, goal_barriers,
    goal_success_criteria. Omit those that aren't stated.
  Health (group "health"): allergies (value_array), dysphagia (value_bool),
    swallowing_alerts (value_array), self_admin_med_support (value_bool),
    clinical_alert (value_text — any high-priority safety/clinical notice, e.g. choking risk),
    special_directions (value_text — care/access notes)
  Medications (group "medications"): emit ONE field per medication listed in the document with
    field_key = "client_medication" and value_json = { name, dose, route, frequency, prn (bool), notes }.
    ALSO emit a single field "pcsp_has_medications" with value_bool. Set TRUE if the document
    lists ANY prescribed/administered medication (even one). Set FALSE only when the document
    explicitly states no medications (e.g. "None", "No current medications", an empty
    medications table, or there is no medications section at all). When uncertain, OMIT the
    pcsp_has_medications field rather than guessing.
  Billing (group "billing_code"): emit ONE field per authorized service code with
    field_key = "billing_code_row" and value_json shaped as below.
    PCSP service authorization table — columns are: Service Code | Kind | Provider |
    Start Date | End Date | Financial Eligibility | Rate | Monthly Max Units | Units |
    Prorated Units | Total $ | Daily Hours. Emit ONE billing_code_row per ROW with:
      value_json = {
        service_code,                 // e.g. "HHS"
        provider_name,                // the Provider column, verbatim org name (AUTHORITATIVE
                                      //   for who delivers this service — e.g.
                                      //   "True North Supports Utah, LLC",
                                      //   "Intermountain Support Coordination Services, LLC",
                                      //   "Utah Transit Authority")
        rate,                         // number, no "$"
        max_units,                    // integer — the ANNUAL "Units" column
        monthly_max_units,            // integer — "Monthly Max Units" column
        unit_type,                    // translate Kind: Q→"15 min", D→"day", M→"month", S→"session"
        plan_start, plan_end,         // ISO yyyy-mm-dd
        financial_eligibility,        // e.g. "TM"
        daily_hours                   // number when present, else null
      }
    Read EVERY row; do not collapse multiple codes into one. Provider column is authoritative.
    On non-PCSP documents that still have a rate column and a units column, fill both
    rate and max_units when the values appear; leave them null only when the document
    genuinely omits them for that code.
  1056 / Service Authorization Form (group "form_1056"): when the document is a DSPD 1056
    Service Authorization Form (header reads "Service Authorization" or "Form 1056"), extract:
      form_1056_number (value_text — the 1056 form number from the header, e.g. "1056-12345")
      form_1056_approved_date (value_date — the approval/effective date, ISO yyyy-mm-dd)
    AND emit one billing_code_row per authorized code in the 1056's authorization table,
    using the SAME billing_code_row shape above. The 1056's rate column is often blank; leave
    rate null when the document omits it. max_units (annual units) is ALWAYS present on a 1056.
  Medications / MAR (group "mar"): when reading a Medication Administration Record, populate
    EVERY field on each client_medication value_json: { name, dose, schedule, route, frequency,
    prescriber, am_pm ("AM" | "PM" | "Both"), scheduled_time ("08:00"), support_level
    ("independent" | "reminder" | "set_up" | "full_assist"), support_explanation }.
  BSP / Behavior Support Plan (group "bsp"): bsp_status (value_text), and free-text notes in
    special_directions if a target behavior or de-escalation strategy is summarised.
  Immunization records (group "health"): immunizations as value_array; one entry per vaccine
    (e.g. "Tdap 2024-03-15").
  Allergy lists (group "health"): allergies as value_array; one entry per allergen + reaction.
  Advanced care (group "advance_care"): dnr_status, dnr_location, polst_status,
    palliative_care_status, hospice_status — each value_text matching the document's wording
    (e.g. "Active", "On file"). Omit any not present.
  SOW (group "sow_clause"): clause_number, required_document, obligation, deadline
  Certification (group "cert"): cert_name, issued_at, expires_at, issuing_body
  Support coordinator (group "support_coordinator"): support_coordinator_name,
    support_coordinator_email, support_coordinator_phone
  Medical (group "medical"): primary_care_name, primary_care_phone,
    neurologist_name, neurologist_phone, dentist_name, dentist_phone,
    prescriber_name, prescriber_phone, medical_insurance,
    diagnoses (value_array), chronic_conditions (value_array),
    immunizations (value_array),
    emergency_medical_treatment_authorization (value_bool),
    advanced_directives (value_bool — true if client has advance directives on file)
  Rights & behavior (group "rights"): rights_restrictions (value_array — one entry per restriction),
    bsp_status (value_text)
  Service plan (group "service_plan"): staff_ratio (value_text e.g. "1:1"),
    preferred_activities (value_array), preferred_living (value_text),
    roommates (value_array), housing_voucher (value_text),
    court_orders (value_array — one entry per court order), personal_belongings_inventory (value_array),
    team_name (value_text)

For each field include source_locator (e.g. "page 3", "§4.2", "row 12 of budget table") and a confidence 0..1.
Never invent data — omit fields not present. Return ONLY JSON, no commentary.`;

export async function parseDocumentWithAI(
  documentText: string,
  hint?: string,
): Promise<ParseOutT> {
  const res = await gatewayFetch({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${hint ? `HINT: ${hint}\n\n` : ""}DOCUMENT TEXT:\n\n${documentText.slice(0, 120_000)}`,
      },
    ],
    response_format: { type: "json_object" },
    // PCSPs frequently produce large JSON envelopes (goals, meds, billing rows).
    // The 4096 default truncated responses mid-string and tripped JSON.parse,
    // surfacing to users as "AI returned malformed JSON". Give real headroom.
    max_tokens: 16000,
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 401)
    throw new Error(
      "AWS Bedrock credentials are not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / BEDROCK_MODEL_ID).",
    );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const content: string = body?.choices?.[0]?.message?.content ?? "{}";
  const finishReason = body?.choices?.[0]?.finish_reason ?? "unknown";
  if (!content || content === "{}") {
    console.error("[document-extraction] Bedrock returned empty content");
  }
  const clean = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean || "{}");
  } catch {
    // Best-effort salvage: response was almost certainly truncated mid-JSON
    // (finish_reason === "length"). Close any unterminated string and balance
    // braces/brackets, then re-parse. tolerantParseExtraction drops any
    // half-written trailing row.
    const salvaged = tryCloseTruncatedJson(clean);
    if (salvaged) {
      try {
        parsed = JSON.parse(salvaged);
      } catch {
        /* fall through */
      }
    }
    if (parsed === undefined) {
      console.error(
        `[document-extraction] JSON.parse failed; finish_reason=${finishReason}; contentLength=${content.length}; tail=${JSON.stringify(content.slice(-200))}`,
      );
      if (finishReason === "length") {
        throw new Error(
          "The document was too long for one extraction pass and the AI response was cut off. Please retry — if it keeps failing, split the PDF.",
        );
      }
      throw new Error("AI returned malformed JSON. The document may be unreadable.");
    }
  }
  return tolerantParseExtraction(parsed, documentText.trim().length, content);
}

// Close an unterminated JSON object/array string well enough for JSON.parse to
// accept the prefix. Returns null if the input doesn't look like JSON.
function tryCloseTruncatedJson(s: string): string | null {
  if (!s || (s[0] !== "{" && s[0] !== "[")) return null;
  let out = s;
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) out += '"';
  // Trim trailing partial tokens like `, "field_key":` or a dangling comma.
  out = out.replace(/,\s*"[^"]*"\s*:?\s*$/g, "").replace(/,\s*$/g, "");
  while (stack.length) {
    const open = stack.pop();
    out += open === "{" ? "}" : "]";
  }
  return out;
}


// ---------------------------------------------------------------
// Tolerant per-field parser.
//
// The model frequently emits one-off violations (confidence: 95, a goal
// longer than 2000 chars, a numeric string instead of a number). The
// previous all-or-nothing safeParse would substitute { fields: [] } on
// ANY violation — silently discarding an entire extraction because a
// single row was malformed. That was the empty-subject root cause.
//
// We now coerce/normalize per field, keep the valid rows, drop only the
// individual rows that can't be salvaged, and surface a real error if
// the model returned content but produced zero usable fields.
// ---------------------------------------------------------------
function coerceConfidence(v: unknown): number {
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) n = Number(m[0]);
  }
  if (n === null || !Number.isFinite(n)) return 0.8;
  if (n > 1) n = n / 100;
  if (n < 0) n = 0;
  if (n > 1) n = 1;
  return n;
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/[^0-9.\-]/g, "");
    if (m) {
      const n = Number(m);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function coerceField(raw: unknown): { field?: ExtractedFieldOut; reason?: string } {
  if (!raw || typeof raw !== "object") return { reason: "not an object" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as Record<string, any>;
  const key = typeof r.field_key === "string" ? r.field_key.trim().slice(0, 80) : "";
  if (!key) return { reason: "missing field_key" };
  const out: ExtractedFieldOut = {
    field_key: key,
    field_group: typeof r.field_group === "string" ? r.field_group.slice(0, 80) : null,
    value_text:
      typeof r.value_text === "string"
        ? r.value_text.slice(0, 2000)
        : r.value_text == null
          ? null
          : String(r.value_text).slice(0, 2000),
    value_number: coerceNumber(r.value_number),
    value_date: typeof r.value_date === "string" ? r.value_date.slice(0, 40) : null,
    value_bool: typeof r.value_bool === "boolean" ? r.value_bool : null,
    value_array: Array.isArray(r.value_array)
      ? r.value_array
          .slice(0, 50)
          .map((x: unknown) => (typeof x === "string" ? x.slice(0, 500) : String(x ?? "").slice(0, 500)))
      : null,
    value_json: r.value_json ?? null,
    source_locator: typeof r.source_locator === "string" ? r.source_locator.slice(0, 200) : null,
    confidence: coerceConfidence(r.confidence),
  };
  return { field: out };
}

function isFieldObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && "field_key" in value;
}

function recoverFieldArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = parsed as Record<string, any>;
  if (Array.isArray(p.fields) && p.fields.length > 0) return p.fields;

  for (const value of Object.values(p)) {
    if (Array.isArray(value) && value.some(isFieldObject)) return value;
  }

  if (p.data && typeof p.data === "object" && Array.isArray(p.data.fields)) return p.data.fields;
  if (p.result && typeof p.result === "object" && Array.isArray(p.result.fields)) return p.result.fields;
  return [];
}

function topLevelKeys(parsed: unknown): string[] {
  if (Array.isArray(parsed)) return ["<array>"];
  if (!parsed || typeof parsed !== "object") return [];
  return Object.keys(parsed as Record<string, unknown>);
}

export function tolerantParseExtraction(
  parsed: unknown,
  documentTextLength: number,
  rawModelContent: string,
): ParseOutT {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (parsed ?? {}) as Record<string, any>;
  const rawFields: unknown[] = recoverFieldArray(parsed);
  if (rawFields.length === 0) {
    console.error(
      `[document-extraction] recovered zero fields; documentText.length=${documentTextLength}; topLevelKeys=${JSON.stringify(topLevelKeys(parsed))}; bedrockModelId=${process.env.BEDROCK_MODEL_ID || "not configured"}; rawContentHead=${rawModelContent.slice(0, 1500)}`,
    );
    if (documentTextLength >= 50) {
      throw new Error(
        `Extraction returned no usable fields from a ${documentTextLength}-char document; model envelope did not contain a 'fields' array.`,
      );
    }
  }
  const kept: ExtractedFieldOut[] = [];
  const dropped: string[] = [];
  for (const rf of rawFields) {
    const { field, reason } = coerceField(rf);
    if (field) kept.push(field);
    else if (reason) dropped.push(reason);
  }
  if (dropped.length) {
    console.warn(
      `[document-extraction] dropped ${dropped.length}/${rawFields.length} field(s): ${dropped.slice(0, 5).join("; ")}`,
    );
  }
  // If the model returned a non-empty fields array but nothing survived,
  // surface a real error instead of silently returning an empty subject.
  if (rawFields.length > 0 && kept.length === 0) {
    throw new Error(
      `AI returned ${rawFields.length} field(s) but none could be parsed (${dropped.slice(0, 3).join("; ") || "unknown reasons"}).`,
    );
  }
  const strOrNull = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : null;
  return {
    document_type: strOrNull(p.document_type, 40),
    fiscal_year: strOrNull(p.fiscal_year, 20),
    effective_start: strOrNull(p.effective_start, 40),
    effective_end: strOrNull(p.effective_end, 40),
    medicaid_id: strOrNull(p.medicaid_id, 50),
    title: strOrNull(p.title, 200),
    fields: kept,
  };
}

