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

export interface StateDepartmentStructure {
  agency_types: string[];
  program_levels: string[];
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
  draft: {},
  published_at: null,
  published_by: null,
};

export const TEMPLATE_SECTIONS = [
  { key: "terminology", label: "Terminology" },
  { key: "training", label: "Training Mandates" },
  { key: "billing_codes", label: "Billing & Service Codes" },
  { key: "evv", label: "EVV Specifics" },
  { key: "required_documents", label: "Required Documents" },
  { key: "department_structure", label: "Department Structure" },
] as const;
export type TemplateSectionKey = (typeof TEMPLATE_SECTIONS)[number]["key"];
