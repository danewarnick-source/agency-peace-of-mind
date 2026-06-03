// Inventory of platform values currently hardcoded for Utah. NECTAR uses
// this list to drive the State Profile → Inventory tab: each item is tagged
// either `config` (will be moved into the state template) or `structural`
// (genuinely different work — opens a HIVE Executive ticket instead).
//
// File:line references point at the canonical site for each value so future
// extractions are quick to find. When a value gets moved into the template
// in Phase 2+, flip `extracted: true` and add the template path (e.g.
// `regulator.name_short`).

export type InventoryArea =
  | "terminology"
  | "regulator"
  | "billing_codes"
  | "forms"
  | "training"
  | "evv"
  | "caps"
  | "citations"
  | "required_documents"
  | "department_structure"
  | "ai_prompts";

export type InventoryKind = "config" | "structural";

export interface InventoryItem {
  id: string;
  area: InventoryArea;
  kind: InventoryKind;
  label: string;
  utah_value: string;
  source: string;           // file path (and line range when stable)
  extracted: boolean;       // true once the value is read from the template
  template_path?: string;   // e.g. "regulator.name_short"
  note?: string;
}

export const STATE_INVENTORY: InventoryItem[] = [
  // ── Regulator identity ─────────────────────────────────────────────────────
  {
    id: "reg.name_short",
    area: "regulator",
    kind: "config",
    label: "Regulator (short)",
    utah_value: "DSPD",
    source: "src/lib/state-templates.ts, multiple components",
    extracted: true,
    template_path: "regulator.name_short",
  },
  {
    id: "reg.name_long",
    area: "regulator",
    kind: "config",
    label: "Regulator (long)",
    utah_value: "Division of Services for People with Disabilities",
    source: "src/lib/state-templates.ts",
    extracted: true,
    template_path: "regulator.name_long",
  },
  {
    id: "reg.parent_short",
    area: "regulator",
    kind: "config",
    label: "Parent agency (short)",
    utah_value: "DHHS",
    source: "NECTAR copy, headers",
    extracted: true,
    template_path: "regulator.parent_agency_short",
  },
  {
    id: "reg.parent_long",
    area: "regulator",
    kind: "config",
    label: "Parent agency (long)",
    utah_value: "Utah Department of Health and Human Services",
    source: "NECTAR copy",
    extracted: true,
    template_path: "regulator.parent_agency_long",
  },
  {
    id: "reg.medicaid",
    area: "regulator",
    kind: "config",
    label: "Medicaid program name",
    utah_value: "Utah Medicaid",
    source: "billing copy, NECTAR",
    extracted: true,
    template_path: "regulator.medicaid_program_name",
  },
  {
    id: "reg.incident_deadline",
    area: "regulator",
    kind: "config",
    label: "Incident submission deadline (hours)",
    utah_value: "24",
    source: "trigger: set_incident_state_deadline",
    extracted: true,
    template_path: "regulator.incident_deadline_hours",
    note: "Trigger still uses literal 24h; will be parameterized in a later phase.",
  },

  // ── Numeric caps ───────────────────────────────────────────────────────────
  {
    id: "caps.respite_consec",
    area: "caps",
    kind: "config",
    label: "Respite — max consecutive days",
    utah_value: "14",
    source: "trigger: enforce_respite_caps",
    extracted: true,
    template_path: "caps.respite_max_consecutive_days",
  },
  {
    id: "caps.respite_annual",
    area: "caps",
    kind: "config",
    label: "Respite — annual ceiling (days)",
    utah_value: "21",
    source: "trigger: enforce_respite_caps",
    extracted: true,
    template_path: "caps.respite_annual_days",
  },
  {
    id: "caps.els_daily",
    area: "caps",
    kind: "config",
    label: "ELS — daily unit cap",
    utah_value: "24",
    source: "trigger: enforce_els_caps",
    extracted: true,
    template_path: "caps.els_daily_units",
  },
  {
    id: "caps.els_annual",
    area: "caps",
    kind: "config",
    label: "ELS — annual day cap",
    utah_value: "260",
    source: "trigger: enforce_els_caps",
    extracted: true,
    template_path: "caps.els_annual_days",
  },
  {
    id: "caps.pba_receipt",
    area: "caps",
    kind: "config",
    label: "PBA — receipt required above (USD)",
    utah_value: "50",
    source: "trigger: enforce_pba_receipt",
    extracted: true,
    template_path: "caps.pba_receipt_threshold_usd",
  },
  {
    id: "caps.belongings_sig",
    area: "caps",
    kind: "config",
    label: "Belongings — discard signature required above (USD)",
    utah_value: "50",
    source: "trigger: enforce_belongings_discard_sig",
    extracted: true,
    template_path: "caps.belongings_signature_threshold_usd",
  },
  {
    id: "caps.evv_locations",
    area: "evv",
    kind: "config",
    label: "EVV — approved locations cap",
    utah_value: "5",
    source: "trigger: enforce_approved_location_cap",
    extracted: true,
    template_path: "evv.approved_locations_cap",
  },

  // ── Citations ──────────────────────────────────────────────────────────────
  {
    id: "cit.respite",
    area: "citations",
    kind: "config",
    label: "Respite caps citation",
    utah_value: "Section 7.4",
    source: "user-facing copy / triggers",
    extracted: true,
    template_path: "citations.sections[respite_caps]",
  },
  {
    id: "cit.els",
    area: "citations",
    kind: "config",
    label: "ELS caps citation",
    utah_value: "Article 10",
    source: "trigger: enforce_els_caps",
    extracted: true,
    template_path: "citations.sections[els_caps]",
  },
  {
    id: "cit.pba",
    area: "citations",
    kind: "config",
    label: "PBA receipt citation",
    utah_value: "Section 1.28",
    source: "trigger: enforce_pba_receipt",
    extracted: true,
    template_path: "citations.sections[pba_receipt]",
  },
  {
    id: "cit.belongings",
    area: "citations",
    kind: "config",
    label: "Belongings discard citation",
    utah_value: "Section 11.3(5)",
    source: "trigger: enforce_belongings_discard_sig",
    extracted: true,
    template_path: "citations.sections[belongings_discard]",
  },

  // ── Billing / service codes ────────────────────────────────────────────────
  {
    id: "codes.evv_list",
    area: "billing_codes",
    kind: "config",
    label: "EVV-required service codes",
    utah_value: "DSI, HHS, RHS, DSG, RL6, RP3, RP4, RP5",
    source: "src/lib/evv-codes.ts, trigger: enforce_client_spending_hourly_shift",
    extracted: false,
    note: "Pending Phase 2b — codes move into billing_codes[].evv_required.",
  },
  {
    id: "codes.daily_unit_codes",
    area: "billing_codes",
    kind: "config",
    label: "Daily-unit (non-hourly) codes",
    utah_value: "HHS, RHS, DSG, RL6, RP3, RP4, RP5",
    source: "trigger: enforce_client_spending_hourly_shift",
    extracted: false,
  },
  {
    id: "codes.variable_rates",
    area: "billing_codes",
    kind: "config",
    label: "Variable-rate billing codes",
    utah_value: "src/lib/variable-rate-codes.ts",
    source: "src/lib/variable-rate-codes.ts",
    extracted: false,
  },
  {
    id: "codes.hcpcs_map",
    area: "billing_codes",
    kind: "config",
    label: "HCPCS / state-billing map",
    utah_value: "src/lib/service-billing.ts",
    source: "src/lib/service-billing.ts",
    extracted: false,
  },
  {
    id: "codes.job_codes",
    area: "billing_codes",
    kind: "config",
    label: "Staff job-code labels",
    utah_value: "src/lib/job-codes.ts",
    source: "src/lib/job-codes.ts",
    extracted: false,
  },

  // ── Forms ──────────────────────────────────────────────────────────────────
  {
    id: "forms.520",
    area: "forms",
    kind: "config",
    label: "Form 520 (state billing claim)",
    utah_value: "Form 520",
    source: "src/routes/dashboard.billing-520.tsx, dashboard.billing.form520.tsx",
    extracted: false,
  },
  {
    id: "forms.1056",
    area: "forms",
    kind: "config",
    label: "Form 1056 (incident report)",
    utah_value: "Form 1056",
    source: "components/workspace/forms-hub-tab.tsx",
    extracted: false,
  },
  {
    id: "forms.pcsp",
    area: "forms",
    kind: "config",
    label: "Person-Centered Service Plan (PCSP)",
    utah_value: "PCSP (annual)",
    source: "src/lib/state-templates.ts seed",
    extracted: false,
  },
  {
    id: "forms.bsp",
    area: "forms",
    kind: "config",
    label: "Behavior Support Plan (BSP)",
    utah_value: "BSP (quarterly review)",
    source: "src/lib/state-templates.ts seed",
    extracted: false,
  },
  {
    id: "forms.520_extractor",
    area: "ai_prompts",
    kind: "structural",
    label: "AI extractor for Form 520",
    utah_value: "Hard-coded prompt in pdf-import.functions.ts",
    source: "src/lib/pdf-import.functions.ts",
    extracted: false,
    note: "Each state form needs its own extractor schema — structural, needs a per-state pluggable extractor.",
  },

  // ── Training mandates ──────────────────────────────────────────────────────
  {
    id: "train.cpr",
    area: "training",
    kind: "config",
    label: "CPR / First Aid cadence",
    utah_value: "24 months",
    source: "src/routes/dashboard.tracks.tsx",
    extracted: false,
  },
  {
    id: "train.hipaa",
    area: "training",
    kind: "config",
    label: "HIPAA annual",
    utah_value: "12 months",
    source: "src/routes/dashboard.tracks.tsx",
    extracted: false,
  },
  {
    id: "train.abuse",
    area: "training",
    kind: "config",
    label: "Abuse / Neglect / Exploitation",
    utah_value: "12 months",
    source: "src/routes/dashboard.tracks.tsx",
    extracted: false,
  },

  // ── EVV configuration ──────────────────────────────────────────────────────
  {
    id: "evv.geofence",
    area: "evv",
    kind: "config",
    label: "Default geofence radius (ft)",
    utah_value: "500",
    source: "src/lib/state-templates.ts seed",
    extracted: true,
    template_path: "evv.default_geofence_feet",
  },
  {
    id: "evv.variance",
    area: "evv",
    kind: "config",
    label: "Clock-in/out variance grace (min)",
    utah_value: "7",
    source: "src/lib/state-templates.ts seed",
    extracted: true,
    template_path: "evv.variance_grace_minutes",
  },

  // ── Terminology / role labels ──────────────────────────────────────────────
  {
    id: "term.dsp",
    area: "terminology",
    kind: "config",
    label: "Direct Support role label",
    utah_value: "Direct Support Professional (DSP)",
    source: "multiple components",
    extracted: false,
  },
  {
    id: "term.house_manager",
    area: "terminology",
    kind: "config",
    label: "House Manager role label",
    utah_value: "House Manager",
    source: "src/lib/rbac.ts (ROLE_LABEL)",
    extracted: false,
  },

  // ── Required documents ────────────────────────────────────────────────────
  {
    id: "doc.fire_drill",
    area: "required_documents",
    kind: "config",
    label: "Fire-drill cadence",
    utah_value: "Monthly",
    source: "components/clients/client-documents-card.tsx",
    extracted: false,
  },

  // ── Genuinely structural (NOT config) ─────────────────────────────────────
  {
    id: "struct.520_state_db",
    area: "forms",
    kind: "structural",
    label: "Direct submission to Utah's state billing system",
    utah_value: "Utah state DB endpoint",
    source: "src/lib/pdf-import.functions.ts and adjacent",
    extracted: false,
    note: "Other states use different submission portals/protocols — requires a per-state submitter implementation, not just config.",
  },
  {
    id: "struct.incident_portal",
    area: "regulator",
    kind: "structural",
    label: "Incident-report submission portal",
    utah_value: "DSPD-specific portal",
    source: "trigger: set_incident_state_deadline + UI",
    extracted: false,
    note: "Each state has its own portal/file format. Pluggable submitter required.",
  },
  {
    id: "struct.evv_aggregator",
    area: "evv",
    kind: "structural",
    label: "EVV aggregator integration",
    utah_value: "Sandata / state-specific aggregator",
    source: "components/evv/*",
    extracted: false,
    note: "Different states use HHAeXchange, Tellus, Sandata, etc. — needs a per-state adapter.",
  },
];

export const INVENTORY_AREAS: Array<{ key: InventoryArea; label: string }> = [
  { key: "regulator", label: "Regulator identity" },
  { key: "terminology", label: "Terminology" },
  { key: "billing_codes", label: "Service & billing codes" },
  { key: "forms", label: "State forms" },
  { key: "training", label: "Training mandates" },
  { key: "evv", label: "EVV configuration" },
  { key: "caps", label: "Numeric caps" },
  { key: "citations", label: "Regulation citations" },
  { key: "required_documents", label: "Required documents" },
  { key: "department_structure", label: "Department structure" },
  { key: "ai_prompts", label: "AI prompts / extractors" },
];
