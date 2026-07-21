// Shared types + defaults for the multi-state template layer.
// State is a configuration layer (not hardcoded logic). The general platform
// model + a per-state template + per-provider configuration compose to produce
// each provider's experience. Utah is the first fully built reference instance.

export type StateStatus = "draft" | "active" | "coming_soon";

export interface PlatformState {
  code: string;
  name: string;
  status: StateStatus;
  is_reference: boolean;
  regulator_label: string | null;
  notes: string | null;
  updated_at?: string;
}

export interface StateTerminology {
  department_name?: string;
  regulator?: string;
  role_labels?: Record<string, string>;
  service_labels?: Record<string, string>;
}

export interface StateTrainingMandate {
  slug: string;
  name: string;
  cadence_months: number | null;
  roles: string[];
}
export interface StateTrainingSection {
  mandates: StateTrainingMandate[];
}

export interface StateBillingCode {
  code: string;
  name: string;
  unit_type: "15min" | "hourly" | "daily" | string;
  evv_required: boolean;
  /** Published standard rate per unit, when the state has one. Optional —
   *  an org's actual contracted rate (client_billing_codes.rate_per_unit)
   *  can differ and always takes precedence once set. */
  rate?: number | null;
}
export interface StateBillingCodesSection {
  codes: StateBillingCode[];
}

export interface StateEvvSection {
  default_geofence_feet: number;
  variance_grace_minutes: number;
  approved_locations_cap: number;
  reconciliation_policy: string;
}

export interface StateRequiredDoc {
  slug: string;
  name: string;
  cadence: "annual" | "quarterly" | "monthly" | "as_needed" | "as_changes" | string;
  attestor: string;
}
export interface StateRequiredDocsSection {
  docs: StateRequiredDoc[];
}

export interface StateForm {
  slug: string;
  name: string;
  cadence: string;
  submission: string;
  produced_by: string;
}
export interface StateFormsSection {
  forms: StateForm[];
}

export interface StateDepartmentStructure {
  agency_types: string[];
  program_levels: string[];
}

// ── New configurable sections (Phase 1 of state-neutralization) ──────────────

/** Per-state regulation references the UI quotes when blocking an action. */
export interface StateCitation {
  key: string;          // stable identifier, e.g. "respite_caps"
  label: string;        // human label, e.g. "Respite caps"
  cite: string;         // citation text shown to the user, e.g. "Section 7.4"
  url?: string | null;  // optional link to the authoritative source
}
export interface StateCitationsSection {
  sections: StateCitation[];
}

/** Numeric thresholds the platform enforces (extracted from Utah-specific
 *  triggers/components). Values are optional so other states can leave them
 *  blank and have the UI surface "Not yet configured". */
export interface StateCapsSection {
  respite_max_consecutive_days?: number;
  respite_annual_days?: number;
  els_daily_units?: number;
  els_annual_days?: number;
  pba_receipt_threshold_usd?: number;
  belongings_signature_threshold_usd?: number;
}

/** Regulator identity — short/long names of the regulating department, parent
 *  agency, Medicaid program label, submission portal URL, and the hours
 *  available to file a state-bound incident report. */
export interface StateRegulatorSection {
  name_short?: string;
  name_long?: string;
  parent_agency_short?: string;
  parent_agency_long?: string;
  medicaid_program_name?: string;
  submission_portal_url?: string | null;
  incident_deadline_hours?: number;
}

export interface StateTemplate {
  id: string;
  state_code: string;
  version: number;
  terminology: StateTerminology;
  training: StateTrainingSection;
  billing_codes: StateBillingCodesSection;
  evv: StateEvvSection;
  required_documents: StateRequiredDocsSection;
  department_structure: StateDepartmentStructure;
  forms: StateFormsSection;
  citations: StateCitationsSection;
  caps: StateCapsSection;
  regulator: StateRegulatorSection;
  draft: Record<string, unknown>;
  published_at: string | null;
  published_by: string | null;
  updated_at: string;
}

// Fallback used by the runtime hook before a template loads or for unknown states.
// Values mirror the seeded Utah template so existing behavior is preserved.
export const FALLBACK_TEMPLATE: Omit<StateTemplate, "id" | "state_code" | "updated_at"> = {
  version: 1,
  terminology: {
    department_name: "Division of Services for People with Disabilities",
    regulator: "DSPD",
    role_labels: {},
    service_labels: {},
  },
  training: { mandates: [] },
  billing_codes: { codes: [] },
  evv: {
    default_geofence_feet: 500,
    variance_grace_minutes: 7,
    approved_locations_cap: 5,
    reconciliation_policy:
      "Shifts outside approved geofences require staff reason at clock-in/out and admin attestation.",
  },
  required_documents: { docs: [] },
  department_structure: { agency_types: [], program_levels: [] },
  forms: { forms: [] },
  citations: { sections: [] },
  caps: {
    respite_max_consecutive_days: 14,
    respite_annual_days: 21,
    els_daily_units: 24,
    els_annual_days: 260,
    pba_receipt_threshold_usd: 50,
    belongings_signature_threshold_usd: 50,
  },
  regulator: {
    name_short: "DSPD",
    name_long: "Division of Services for People with Disabilities",
    parent_agency_short: "DHHS",
    parent_agency_long: "Utah Department of Health and Human Services",
    medicaid_program_name: "Utah Medicaid",
    submission_portal_url: null,
    incident_deadline_hours: 24,
  },
  draft: {},
  published_at: null,
  published_by: null,
};

export const TEMPLATE_SECTIONS = [
  { key: "terminology", label: "Terminology" },
  { key: "regulator", label: "Regulator Identity" },
  { key: "billing_codes", label: "Service & Billing Codes" },
  { key: "forms", label: "State Forms" },
  { key: "training", label: "Training Mandates" },
  { key: "evv", label: "EVV Configuration" },
  { key: "caps", label: "Numeric Caps & Limits" },
  { key: "citations", label: "Regulation Citations" },
  { key: "required_documents", label: "Required Documents" },
  { key: "department_structure", label: "Department Structure" },
] as const;
export type TemplateSectionKey = (typeof TEMPLATE_SECTIONS)[number]["key"];
