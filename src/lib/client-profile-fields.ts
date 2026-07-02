// ─── Client field registry ────────────────────────────────────────────────
// ONE source of truth bridging extraction → store → wizard → profile.
// Every tracked client field is declared here once. Extraction writes under
// the same `key` the wizard reads from and the profile displays.
//
// Storage:
//   - { kind: "column", column } — clients.<column> (typed table)
//   - { kind: "custom" }         — custom_field_values keyed by field.key
//
// extractionKeys lets the same canonical field absorb aliases the AI/PCSP
// parser may emit (e.g. "sc_name", "coordinator_name" → support_coordinator_name).

export type ProfileFieldStorage =
  | { kind: "column"; column: string }
  | { kind: "custom" };

export type ProfileFieldType = "text" | "textarea" | "bool" | "array" | "date";

export interface ProfileField {
  key: string;                 // canonical key — MUST equal the extraction field_key
  label: string;
  type: ProfileFieldType;
  storage: ProfileFieldStorage;
  sowRequired?: boolean;
  extractionKeys?: string[];   // additional extracted keys mapping to this field
  helpText?: string;
}

export const CLIENT_PROFILE_FIELDS: ProfileField[] = [
  // ── Column-backed identity & contact ──────────────────────────────────
  { key: "first_name", label: "First name", type: "text",
    storage: { kind: "column", column: "first_name" } },
  { key: "last_name", label: "Last name", type: "text",
    storage: { kind: "column", column: "last_name" } },
  { key: "date_of_birth", label: "Date of birth", type: "date",
    storage: { kind: "column", column: "date_of_birth" }, extractionKeys: ["dob"] },
  { key: "medicaid_id", label: "Medicaid ID", type: "text",
    storage: { kind: "column", column: "medicaid_id" } },
  { key: "phone_number", label: "Phone", type: "text",
    storage: { kind: "column", column: "phone_number" }, extractionKeys: ["phone"] },
  { key: "physical_address", label: "Physical address", type: "text",
    storage: { kind: "column", column: "physical_address" } },

  // ── SOW-required column fields ────────────────────────────────────────
  { key: "emergency_contact_name", label: "Emergency contact name", type: "text",
    storage: { kind: "column", column: "emergency_contact_name" }, sowRequired: true },
  { key: "emergency_contact_phone", label: "Emergency contact phone", type: "text",
    storage: { kind: "column", column: "emergency_contact_phone" }, sowRequired: true },
  { key: "allergies", label: "Allergies / clinical alert", type: "array",
    storage: { kind: "column", column: "allergies" }, sowRequired: true },
  { key: "special_directions", label: "Special directions", type: "textarea",
    storage: { kind: "column", column: "special_directions" }, sowRequired: true,
    extractionKeys: ["clinical_alert"] },

  // ── Custom-backed: support coordinator (PCSP-extracted, was rendering empty) ──
  { key: "support_coordinator_name", label: "Support coordinator name", type: "text",
    storage: { kind: "custom" }, sowRequired: true,
    extractionKeys: ["sc_name", "coordinator_name", "support_coordinator"] },
  { key: "support_coordinator_phone", label: "Support coordinator phone", type: "text",
    storage: { kind: "custom" }, sowRequired: true,
    extractionKeys: ["sc_phone", "coordinator_phone"] },
  { key: "support_coordinator_email", label: "Support coordinator email", type: "text",
    storage: { kind: "custom" }, sowRequired: true,
    extractionKeys: ["sc_email", "coordinator_email"] },

  // ── Custom-backed: medical providers ──────────────────────────────────
  { key: "primary_care_name", label: "Primary care provider name", type: "text",
    storage: { kind: "custom" }, sowRequired: true, extractionKeys: ["pcp_name"] },
  { key: "primary_care_phone", label: "Primary care provider phone", type: "text",
    storage: { kind: "custom" }, sowRequired: true, extractionKeys: ["pcp_phone"] },
  { key: "neurologist_name", label: "Neurologist name", type: "text",
    storage: { kind: "custom" } },
  { key: "neurologist_phone", label: "Neurologist phone", type: "text",
    storage: { kind: "custom" } },
  { key: "dentist_name", label: "Dentist name", type: "text",
    storage: { kind: "custom" } },
  { key: "dentist_phone", label: "Dentist phone", type: "text",
    storage: { kind: "custom" } },
  { key: "prescriber_name", label: "Prescribing physician name", type: "text",
    storage: { kind: "custom" } },
  { key: "prescriber_phone", label: "Prescribing physician phone", type: "text",
    storage: { kind: "custom" } },
  { key: "medical_insurance", label: "Medical insurance", type: "text",
    storage: { kind: "custom" } },

  // ── Custom-backed: directives, clinical, legal ────────────────────────
  { key: "advanced_directives", label: "Advanced directives", type: "textarea",
    storage: { kind: "custom" }, sowRequired: true },
  { key: "emergency_medical_treatment_authorization",
    label: "Emergency medical treatment authorization", type: "bool",
    storage: { kind: "custom" }, sowRequired: true },
  { key: "diagnoses", label: "Diagnoses", type: "array",
    storage: { kind: "custom" } },
  { key: "chronic_conditions", label: "Chronic conditions", type: "array",
    storage: { kind: "custom" } },
  { key: "immunizations", label: "Immunizations", type: "text",
    storage: { kind: "custom" } },
  { key: "court_orders", label: "Court orders", type: "textarea",
    storage: { kind: "custom" } },
  { key: "housing_voucher", label: "Housing voucher", type: "text",
    storage: { kind: "custom" } },

  // ── Expanded PCSP-first profile capture (custom-backed) ───────────────
  // Every field the standard Utah DSPD PCSP surfaces but the clients table
  // doesn't have a dedicated column for. Registered here so extraction lands
  // it AND the profile UI (registry-driven) renders it as a first-class row.
  { key: "preferred_name", label: "Preferred name / nickname", type: "text",
    storage: { kind: "custom" } },
  { key: "pronouns", label: "Pronouns", type: "text",
    storage: { kind: "custom" } },
  { key: "gender", label: "Gender", type: "text",
    storage: { kind: "custom" } },
  { key: "primary_language", label: "Primary language", type: "text",
    storage: { kind: "custom" } },
  { key: "communication_notes", label: "Communication notes", type: "textarea",
    storage: { kind: "custom" } },
  { key: "race", label: "Race", type: "text",
    storage: { kind: "custom" } },
  { key: "ethnicity", label: "Ethnicity", type: "text",
    storage: { kind: "custom" } },
  { key: "marital_status", label: "Marital status", type: "text",
    storage: { kind: "custom" } },
  { key: "secondary_phone", label: "Secondary phone", type: "text",
    storage: { kind: "custom" } },
  { key: "email", label: "Email", type: "text",
    storage: { kind: "custom" } },
  { key: "county", label: "County", type: "text",
    storage: { kind: "custom" } },
  { key: "mobility_notes", label: "Mobility notes", type: "textarea",
    storage: { kind: "custom" } },
  { key: "adaptive_equipment", label: "Adaptive equipment", type: "textarea",
    storage: { kind: "custom" } },
  { key: "dietary_restrictions", label: "Dietary restrictions", type: "textarea",
    storage: { kind: "custom" } },
  { key: "vision_status", label: "Vision", type: "text",
    storage: { kind: "custom" } },
  { key: "hearing_status", label: "Hearing", type: "text",
    storage: { kind: "custom" } },
  { key: "weight", label: "Weight", type: "text",
    storage: { kind: "custom" } },
  { key: "height", label: "Height", type: "text",
    storage: { kind: "custom" } },
  { key: "blood_type", label: "Blood type", type: "text",
    storage: { kind: "custom" } },
  { key: "day_program_name", label: "Day program name", type: "text",
    storage: { kind: "custom" } },
  { key: "day_program_phone", label: "Day program phone", type: "text",
    storage: { kind: "custom" } },
  { key: "transportation_notes", label: "Transportation notes", type: "textarea",
    storage: { kind: "custom" } },
  { key: "funding_source", label: "Funding source", type: "text",
    storage: { kind: "custom" } },
  { key: "secondary_insurance", label: "Secondary insurance", type: "text",
    storage: { kind: "custom" } },
  { key: "medicare_id", label: "Medicare ID", type: "text",
    storage: { kind: "custom" } },
  { key: "representative_payee", label: "Representative payee", type: "text",
    storage: { kind: "custom" } },
  // PCSP plan metadata
  { key: "pcsp_author_name", label: "PCSP author / facilitator", type: "text",
    storage: { kind: "custom" } },
  { key: "pcsp_meeting_date", label: "PCSP meeting date", type: "date",
    storage: { kind: "custom" } },
  { key: "pcsp_effective_start", label: "PCSP effective start", type: "date",
    storage: { kind: "custom" } },
  { key: "pcsp_review_date", label: "PCSP review date", type: "date",
    storage: { kind: "custom" } },
  { key: "pcsp_signed_by_client", label: "PCSP signed by client", type: "bool",
    storage: { kind: "custom" } },
  { key: "pcsp_signed_by_guardian", label: "PCSP signed by guardian", type: "bool",
    storage: { kind: "custom" } },
];

export type CustomValueRow = {
  value_text: string | null;
  value_boolean: boolean | null;
};

export type ProfileCustomsMap = Record<string, CustomValueRow | null>;

export const PROFILE_FIELD_BY_KEY: Record<string, ProfileField> = Object.fromEntries(
  CLIENT_PROFILE_FIELDS.map((f) => [f.key, f]),
);

/** All clients columns the registry needs to read for column-backed fields. */
export const PROFILE_CLIENT_COLUMNS: string[] = Array.from(
  new Set(
    CLIENT_PROFILE_FIELDS
      .filter((f) => f.storage.kind === "column")
      .map((f) => (f.storage as { column: string }).column),
  ),
);

/** All registry keys (column + custom) — used to bound custom-field queries. */
export const PROFILE_FIELD_KEYS: string[] = CLIENT_PROFILE_FIELDS.map((f) => f.key);

/** Custom-only keys — used to query custom_field_definitions efficiently. */
export const PROFILE_CUSTOM_KEYS: string[] = CLIENT_PROFILE_FIELDS
  .filter((f) => f.storage.kind === "custom")
  .map((f) => f.key);

/**
 * Read the canonical value for `field` from the client row + custom-value map.
 * Returns null when the field has no value.
 */
export function getProfileFieldValue(
  client: Record<string, unknown> | null | undefined,
  customValuesByKey: ProfileCustomsMap | null | undefined,
  field: ProfileField,
): string | boolean | string[] | null {
  if (field.storage.kind === "column") {
    const v = client ? client[field.storage.column] : null;
    if (v == null) return null;
    if (field.type === "array") return Array.isArray(v) ? (v as string[]) : null;
    if (field.type === "bool") return typeof v === "boolean" ? v : null;
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    return null;
  }
  const v = customValuesByKey?.[field.key];
  if (!v) return null;
  if (field.type === "bool") return typeof v.value_boolean === "boolean" ? v.value_boolean : null;
  if (field.type === "array") {
    if (!v.value_text) return null;
    return v.value_text
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v.value_text ?? null;
}

/** True when getProfileFieldValue returns a non-empty value. */
export function profileFieldHasValue(
  client: Record<string, unknown> | null | undefined,
  customValuesByKey: ProfileCustomsMap | null | undefined,
  field: ProfileField,
): boolean {
  const v = getProfileFieldValue(client, customValuesByKey, field);
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return v === true; // an explicit false is "not authorized" — still a gap to confirm
  return false;
}

/** Format a registry value for display (single string snippet). */
export function formatProfileFieldValue(
  client: Record<string, unknown> | null | undefined,
  customValuesByKey: ProfileCustomsMap | null | undefined,
  field: ProfileField,
): string | null {
  const v = getProfileFieldValue(client, customValuesByKey, field);
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Persist a value for `field` to its canonical store. Throws on RLS / DB
 * failure; throws when zero rows were affected (so callers don't show a
 * green toast for a no-op write).
 */
export async function writeProfileFieldValue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
  clientId: string,
  field: ProfileField,
  value: string | boolean | string[] | null,
): Promise<void> {
  if (field.storage.kind === "column") {
    const col = field.storage.column;
    let payload: unknown;
    switch (field.type) {
      case "array":
        payload = Array.isArray(value)
          ? value.map((s) => String(s).trim()).filter(Boolean)
          : typeof value === "string" && value.trim()
            ? value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
            : [];
        break;
      case "bool":
        payload = value === true || value === "true" || value === "yes";
        break;
      case "date":
        payload = typeof value === "string" && value.trim() ? value.trim() : null;
        break;
      default:
        payload = typeof value === "string" && value.trim() ? value.trim() : null;
    }
    const { data, error } = await sb
      .from("clients")
      .update({ [col]: payload })
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error(`Update of clients.${col} affected no rows.`);
    }
    return;
  }

  // Custom field path — upsert definition then value.
  const { data: def, error: defErr } = await sb
    .from("custom_field_definitions")
    .upsert(
      {
        organization_id: orgId,
        entity_kind: "client",
        field_key: field.key,
        field_label: field.label,
        data_type: field.type === "bool" ? "boolean" : "text",
        source: "manual",
      },
      { onConflict: "organization_id,entity_kind,field_key" },
    )
    .select("id")
    .single();
  if (defErr || !def) {
    throw new Error(defErr?.message ?? "Failed to upsert custom field definition.");
  }

  let value_text: string | null = null;
  let value_boolean: boolean | null = null;
  if (field.type === "bool") {
    value_boolean = value === true || value === "true" || value === "yes";
  } else if (field.type === "array") {
    const arr = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
        : [];
    value_text = arr.length ? arr.join(", ") : null;
  } else {
    value_text = typeof value === "string" && value.trim() ? value.trim() : null;
  }

  const { data, error } = await sb
    .from("custom_field_values")
    .upsert(
      {
        organization_id: orgId,
        definition_id: def.id,
        entity_kind: "client",
        entity_id: clientId,
        value_text,
        value_boolean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "definition_id,entity_id" },
    )
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(`Upsert of custom_field_values for ${field.key} affected no rows.`);
  }
}
