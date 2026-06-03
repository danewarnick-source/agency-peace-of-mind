// Shared definition of the New State Onboarding questionnaire.
// HIVE Executives walk a state through these sections once. Answers feed the
// state template (Prompt 47); items marked as needing a platform build open
// HIVE NECTAR tickets so structural work is tracked rather than assumed.

export type OnboardingFieldType = "text" | "textarea" | "list" | "number";

export interface OnboardingField {
  key: string;
  label: string;
  type: OnboardingFieldType;
  placeholder?: string;
  help?: string;
  /** Suggests this answer often surfaces a build need (e.g. unusual billing model). */
  buildSensitive?: boolean;
}

export interface OnboardingSection {
  key: string;
  title: string;
  blurb: string;
  fields: OnboardingField[];
  /** Maps onboarding answers into a partial state_templates section value. */
  templateSection?:
    | "terminology"
    | "training"
    | "billing_codes"
    | "evv"
    | "required_documents"
    | "department_structure";
}

export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    key: "agency",
    title: "Governing agency & terminology",
    blurb:
      "What this state calls its disability-services body and the names providers use day-to-day. These become the labels surfaced across the platform for providers in this state.",
    templateSection: "terminology",
    fields: [
      { key: "department_name", label: "Department / division full name", type: "text", placeholder: "e.g. Division of Services for People with Disabilities" },
      { key: "regulator", label: "Short regulator label", type: "text", placeholder: "e.g. DSPD" },
      { key: "program_names", label: "Program names (one per line)", type: "list", help: "Comma- or newline-separated. Example: Community Supports, Host Home, Day Services." },
      { key: "service_names", label: "Service names (one per line)", type: "list", help: "How services are referenced in this state's policy and billing." },
      { key: "role_names", label: "Role names that differ from Utah baseline (one per line)", type: "list", placeholder: "e.g. DSP, Service Coordinator, Host Provider", buildSensitive: true },
    ],
  },
  {
    key: "billing_codes",
    title: "Billing & service codes",
    blurb:
      "The state's service-code catalog and how billing is structured. Flag anything that doesn't fit the existing model — different units, blended codes, capitated services — so the platform can be extended rather than misrepresented.",
    templateSection: "billing_codes",
    fields: [
      { key: "codes", label: "Service codes (one per line: CODE | Name | unit_type | evv?)", type: "textarea", placeholder: "HHS | Host Home Services | daily | true\nRSP | Respite | 15min | true", help: "unit_type: 15min, hourly, daily. evv?: true/false." },
      { key: "rate_model", label: "Rate / unit model notes", type: "textarea", buildSensitive: true, placeholder: "e.g. tiered rates by acuity, daily-unit codes can't be split, capitated bundle for day program." },
      { key: "structural_differences", label: "Structural differences vs. Utah model", type: "textarea", buildSensitive: true, help: "Anything this state bills in a way the current code-type structure can't represent." },
    ],
  },
  {
    key: "forms",
    title: "State billing / authorization forms",
    blurb:
      "The state's equivalents of the 520, 1056, PCSP, etc. Where these differ structurally (not just labels), the platform may need to ship a new form generator — call those out explicitly.",
    fields: [
      { key: "billing_form_520", label: "Billing submission form (520-equivalent) name & format", type: "textarea", buildSensitive: true, placeholder: "Name, file format (CSV/EDI/portal), submission cadence, who submits." },
      { key: "auth_form_1056", label: "Authorization form (1056-equivalent) name & process", type: "textarea", buildSensitive: true },
      { key: "pcsp_equivalent", label: "PCSP / person-centered plan equivalent", type: "textarea", placeholder: "What it's called, who signs, renewal cadence." },
      { key: "other_forms", label: "Other state forms (one per line)", type: "list" },
    ],
  },
  {
    key: "training",
    title: "Training mandates",
    blurb: "Required staff trainings/certifications specific to this state. These seed the training catalog providers in this state inherit.",
    templateSection: "training",
    fields: [
      { key: "mandates", label: "Mandates (one per line: slug | Name | cadence_months | roles)", type: "textarea", placeholder: "cpr-fa | CPR / First Aid | 24 | dsp,manager\nabuse-neglect | Abuse & Neglect | 12 | dsp" },
    ],
  },
  {
    key: "evv",
    title: "EVV requirements",
    blurb: "The state's EVV rules — aggregator, geofence tolerance, variance handling — that the EVV layer must enforce for providers in this state.",
    templateSection: "evv",
    fields: [
      { key: "aggregator", label: "EVV aggregator", type: "text", placeholder: "e.g. HHAeXchange, Sandata, in-state portal", buildSensitive: true },
      { key: "default_geofence_feet", label: "Default geofence radius (feet)", type: "number", placeholder: "500" },
      { key: "variance_grace_minutes", label: "Variance grace (minutes)", type: "number", placeholder: "7" },
      { key: "reconciliation_policy", label: "Reconciliation / variance policy", type: "textarea" },
    ],
  },
  {
    key: "sources",
    title: "Authoritative sources",
    blurb:
      "Upload the state's SOW/contract equivalent and authoritative requirement documents. NECTAR parses these into per-state requirements with source attribution (manage in Requirements & Sources after creating this state).",
    fields: [
      { key: "sources_summary", label: "Summary of authoritative sources for this state", type: "textarea", placeholder: "List the documents you'll upload after onboarding — provider contract, billing manual, EVV policy, code book, etc." },
    ],
  },
  {
    key: "documents",
    title: "Required documents & cadences",
    blurb: "What the state mandates providers keep current, and on what cadence. Seeds the per-state required-documents catalog.",
    templateSection: "required_documents",
    fields: [
      { key: "docs", label: "Required docs (one per line: slug | Name | cadence | attestor)", type: "textarea", placeholder: "annual-monitoring | Annual Monitoring | annual | admin\nfire-drill | Fire Drill Log | monthly | manager", help: "cadence: annual, quarterly, monthly, as_needed, as_changes." },
    ],
  },
];

// ─── Template projection ─────────────────────────────────────────────────────
// Convert raw onboarding answers into the structured template-section values
// the existing editor consumes. Tolerant of partial/empty input.

type AnyAnswers = Record<string, Record<string, string>>;

function splitLines(v: string | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function projectAnswersToTemplate(answers: AnyAnswers): Record<string, unknown> {
  const agency = answers.agency ?? {};
  const billing = answers.billing_codes ?? {};
  const training = answers.training ?? {};
  const evv = answers.evv ?? {};
  const docs = answers.documents ?? {};

  const role_labels: Record<string, string> = {};
  for (const r of splitLines(agency.role_names)) role_labels[r.toLowerCase().replace(/\s+/g, "_")] = r;
  const service_labels: Record<string, string> = {};
  for (const s of splitLines(agency.service_names)) service_labels[s.toLowerCase().replace(/\s+/g, "_")] = s;

  const codes = splitLines(billing.codes).map((line) => {
    const [code, name, unit_type, evvRaw] = line.split("|").map((p) => p?.trim() ?? "");
    return {
      code: (code || "").toUpperCase(),
      name: name || code || "",
      unit_type: (unit_type as "15min" | "hourly" | "daily") || "hourly",
      evv_required: /^(true|yes|y|1)$/i.test(evvRaw || ""),
    };
  }).filter((c) => c.code);

  const mandates = splitLines(training.mandates).map((line) => {
    const [slug, name, cadence, roles] = line.split("|").map((p) => p?.trim() ?? "");
    const months = Number.parseInt(cadence || "", 10);
    return {
      slug: slug || (name || "").toLowerCase().replace(/\s+/g, "-"),
      name: name || slug || "",
      cadence_months: Number.isFinite(months) ? months : null,
      roles: roles ? roles.split(/[,\s]+/).filter(Boolean) : [],
    };
  }).filter((m) => m.slug);

  const requiredDocs = splitLines(docs.docs).map((line) => {
    const [slug, name, cadence, attestor] = line.split("|").map((p) => p?.trim() ?? "");
    return {
      slug: slug || (name || "").toLowerCase().replace(/\s+/g, "-"),
      name: name || slug || "",
      cadence: cadence || "as_needed",
      attestor: attestor || "admin",
    };
  }).filter((d) => d.slug);

  return {
    terminology: {
      department_name: agency.department_name || undefined,
      regulator: agency.regulator || undefined,
      role_labels,
      service_labels,
    },
    billing_codes: { codes },
    training: { mandates },
    evv: {
      default_geofence_feet: Number.parseInt(evv.default_geofence_feet || "500", 10) || 500,
      variance_grace_minutes: Number.parseInt(evv.variance_grace_minutes || "7", 10) || 7,
      approved_locations_cap: 5,
      reconciliation_policy:
        evv.reconciliation_policy ||
        "Shifts outside approved geofences require staff reason at clock-in/out and admin attestation.",
    },
    required_documents: { docs: requiredDocs },
    department_structure: {
      agency_types: splitLines(agency.program_names),
      program_levels: [],
    },
  };
}

// ─── Inverse: hydrate onboarding answers from an existing template ──────────
// Powers the "Copy from existing state" starting-point so the wizard opens
// pre-filled with the source state's values, ready to edit.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function templateToAnswers(tpl: any): AnyAnswers {
  if (!tpl) return {};
  const term = tpl.terminology ?? {};
  const dept = tpl.department_structure ?? {};
  const codes: Array<{ code?: string; name?: string; unit_type?: string; evv_required?: boolean }> =
    tpl.billing_codes?.codes ?? [];
  const mandates: Array<{ slug?: string; name?: string; cadence_months?: number | null; roles?: string[] }> =
    tpl.training?.mandates ?? [];
  const docs: Array<{ slug?: string; name?: string; cadence?: string; attestor?: string }> =
    tpl.required_documents?.docs ?? [];
  const evv = tpl.evv ?? {};

  return {
    agency: {
      department_name: term.department_name ?? "",
      regulator: term.regulator ?? "",
      program_names: (dept.agency_types ?? []).join("\n"),
      service_names: Object.values(term.service_labels ?? {}).join("\n"),
      role_names: Object.values(term.role_labels ?? {}).join("\n"),
    },
    billing_codes: {
      codes: codes
        .map((c) => `${c.code ?? ""} | ${c.name ?? ""} | ${c.unit_type ?? "hourly"} | ${c.evv_required ? "true" : "false"}`)
        .join("\n"),
      rate_model: "",
      structural_differences: "",
    },
    training: {
      mandates: mandates
        .map((m) => `${m.slug ?? ""} | ${m.name ?? ""} | ${m.cadence_months ?? ""} | ${(m.roles ?? []).join(",")}`)
        .join("\n"),
    },
    evv: {
      aggregator: "",
      default_geofence_feet: String(evv.default_geofence_feet ?? 500),
      variance_grace_minutes: String(evv.variance_grace_minutes ?? 7),
      reconciliation_policy: evv.reconciliation_policy ?? "",
    },
    documents: {
      docs: docs
        .map((d) => `${d.slug ?? ""} | ${d.name ?? ""} | ${d.cadence ?? "as_needed"} | ${d.attestor ?? "admin"}`)
        .join("\n"),
    },
  };
}

