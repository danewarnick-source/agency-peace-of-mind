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
  // Address
  "physical_address",
  // Emergency contact (split, never one blob)
  "emergency_contact_name", "emergency_contact_phone", "emergency_contact_instructions",
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
  // Rights / behavior
  "rights_restrictions", "bsp_status",
  // Service plan
  "staff_ratio", "preferred_activities", "preferred_living", "roommates",
  "housing_voucher", "court_orders", "personal_belongings_inventory",
  "team_name",
]);

export const SYSTEM_PROMPT = `You are NECTAR, an extraction engine for a Utah DSPD provider compliance platform (HIVE).
You receive raw text from a document (PCSP, 1056 budget, SOW, referral, intake, assessment, certification, contract, etc.).
Take your time. Accuracy is more important than speed. Extract EVERY field that appears in the document.

Return STRICT JSON only. Use these conventions:

document_type: one of pcsp | 1056_budget | sow | referral | intake | assessment | certification | training | contract | evv_report | timesheet | incident_report | billing_record | other
fiscal_year: e.g. "FY26"
effective_start / effective_end: ISO yyyy-mm-dd
medicaid_id: digits only if present

Each extracted field has: field_key, field_group, optional value_text / value_number / value_date / value_bool / value_array / value_json, source_locator, confidence (0..1).
- Dates in value_date as ISO yyyy-mm-dd.
- Booleans in value_bool.
- Short string lists (allergies, diagnoses, chronic_conditions, swallowing_alerts, immunizations, preferred_activities, roommates, personal_belongings_inventory) in value_array — NEVER joined into one string.
- Structured rows (per-code billing authorizations) in value_json.

Common field_key values to extract when present (use field_group to bucket related fields):
  Person (group "person"): first_name, last_name, dob (value_date), medicaid_id, phone, plan_year
  Address (group "address"): physical_address  -- client's service/home street address
  Emergency contact (group "emergency_contact"): emergency_contact_name, emergency_contact_phone, emergency_contact_instructions
    ALWAYS split name and phone into TWO separate fields. Never combine.
  Guardian (group "guardian"): is_own_guardian (value_bool), guardian_name, guardian_phone,
    guardian_relationship, guardian_email, guardian_address
  Goals (group "goals"): pcsp_goal -- emit ONE field per distinct goal/objective in value_text.
    PCSP goals often appear in a table (Goal / Objective / Support Code). Emit one pcsp_goal
    per ROW, not one combined entry.
  Health (group "health"): allergies (value_array), dysphagia (value_bool),
    swallowing_alerts (value_array), self_admin_med_support (value_bool),
    clinical_alert (value_text — any high-priority safety/clinical notice, e.g. choking risk),
    special_directions (value_text — care/access notes)
  Billing (group "billing_code"): emit ONE field per authorized service code with
    field_key = "billing_code_row" and
    value_json = { service_code, rate, max_units, unit_type, weekly_cap_units, plan_start, plan_end, financial_eligibility }.
    rate is the dollar rate per unit (a number, no "$"). max_units is the ANNUAL unit
    authorization (an integer, e.g. 3120 for DSI, 960 for SEI). unit_type is "15 min"
    or "day" or "session" or "month" exactly as printed. Read EVERY row of the
    authorization table; do not collapse multiple codes into one.
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
    advanced_directives (value_text)
  Rights & behavior (group "rights"): rights_restrictions (value_text),
    bsp_status (value_text)
  Service plan (group "service_plan"): staff_ratio (value_text e.g. "1:1"),
    preferred_activities (value_array), preferred_living (value_text),
    roommates (value_array), housing_voucher (value_text),
    court_orders (value_text), personal_belongings_inventory (value_array),
    team_name (value_text)

For each field include source_locator (e.g. "page 3", "§4.2", "row 12 of budget table") and a confidence 0..1.
Never invent data — omit fields not present. Return ONLY JSON, no commentary.`;

export async function parseDocumentWithAI(
  documentText: string,
  hint?: string,
): Promise<ParseOutT> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  // gemini-2.5-pro for accuracy on dense PCSP tables; falls back gracefully.
  const res = await gatewayFetch({
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${hint ? `HINT: ${hint}\n\n` : ""}DOCUMENT TEXT:\n\n${documentText.slice(0, 120_000)}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings → Workspace → Usage.");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
  }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { parsed = {}; }
  const result = ParseOut.safeParse(parsed);
  return result.success ? result.data : { fields: [] };
}
