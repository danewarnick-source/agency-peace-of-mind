/**
 * Editable, single-source schema for category-specific Incident Report
 * detail blocks. The form renders the block matching the selected category
 * and stores all answers under `incident_reports.details` (jsonb) keyed by
 * the field `name`. Required fields are enforced in the form's submit
 * validator. The admin detail view renders these labels back.
 *
 * Tune fields here — the dialog reads this file at runtime.
 */

export type DetailField =
  | { name: string; label: string; type: "text"; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: "textarea"; required?: boolean; rows?: number; placeholder?: string }
  | { name: string; label: string; type: "datetime"; required?: boolean }
  | { name: string; label: string; type: "select"; required?: boolean; options: string[] }
  | { name: string; label: string; type: "multiselect"; required?: boolean; options: string[] }
  | { name: string; label: string; type: "yesno"; required?: boolean }
  | { name: string; label: string; type: "yesno_na"; required?: boolean }
  | { name: string; label: string; type: "photos"; required?: boolean; max?: number };

export type DetailBlock = {
  key: DetailCategoryKey;
  title: string;
  /** Optional intro / legal notice rendered above the fields. */
  notice?: { tone: "info" | "amber" | "red"; text: string };
  fields: DetailField[];
};

export type DetailCategoryKey =
  | "abuse"
  | "injury"
  | "medication_error"
  | "medical"
  | "missing"
  | "behavior"
  | "police"
  | "fatality"
  | "property";

// ---------------------------------------------------------------------------
// Canonical category names (kept in lock-step with incident-categories.ts).
// Re-exported so nectar-triggers can build its term→category map without
// importing the dialog's category list directly.
// ---------------------------------------------------------------------------

export const INJURY_CATEGORY_NAME = "Injury";
export const MEDICATION_ERROR_CATEGORY_NAME = "Medication error";
export const MEDICAL_EMERGENCY_CATEGORY_NAME = "Medical emergency";
export const UNPLANNED_MEDICAL_CATEGORY_NAME = "Unplanned medical visit (ER/urgent care)";
export const BEHAVIOR_CATEGORY_NAME = "Extreme behavior episode";
export const ABUSE_CATEGORY_NAME = "Abuse, neglect, or exploitation";
export const POLICE_CATEGORY_NAME = "Police involvement";
export const MISSING_CATEGORY_NAME = "Missing person / elopement";
export const FATALITY_CATEGORY_NAME = "Death/fatality";
export const PROPERTY_CATEGORY_NAME = "Property damage";
export const THEFT_CATEGORY_NAME = "Theft";
export const VEHICLE_CATEGORY_NAME = "Vehicle accident";

/**
 * EDITABLE — Adult Protective Services intake number, surfaced prominently
 * inside the Abuse legal notice. Verify against the current Utah listing
 * before changing.
 */
export const APS_HOTLINE = "1-800-371-7897";

/** Category-name → detail-block key. "Other" and miscellaneous categories
 *  with no block return null. */
export function detailKeyForCategory(category: string | null | undefined): DetailCategoryKey | null {
  if (!category) return null;
  switch (category) {
    case INJURY_CATEGORY_NAME: return "injury";
    case MEDICATION_ERROR_CATEGORY_NAME: return "medication_error";
    case MEDICAL_EMERGENCY_CATEGORY_NAME:
    case UNPLANNED_MEDICAL_CATEGORY_NAME:
      return "medical";
    case BEHAVIOR_CATEGORY_NAME: return "behavior";
    case ABUSE_CATEGORY_NAME: return "abuse";
    case POLICE_CATEGORY_NAME: return "police";
    case MISSING_CATEGORY_NAME: return "missing";
    case FATALITY_CATEGORY_NAME: return "fatality";
    case PROPERTY_CATEGORY_NAME:
    case THEFT_CATEGORY_NAME:
    case VEHICLE_CATEGORY_NAME:
      return "property";
    default: return null;
  }
}

const BODY_LOCATIONS = [
  "Head/face", "Neck", "Chest", "Back", "Abdomen",
  "Left arm", "Right arm", "Left hand", "Right hand",
  "Left leg", "Right leg", "Left foot", "Right foot",
  "Hip/pelvis", "Other",
];

const INJURY_TYPES = [
  "Bruise", "Cut/laceration", "Abrasion", "Burn", "Swelling",
  "Bite mark", "Suspected sprain", "Suspected fracture", "Other",
];

const INJURY_SEVERITY = [
  "First aid on site", "Urgent care", "ER", "911",
];

const ABUSE_TYPES = [
  "Physical", "Sexual", "Emotional", "Neglect", "Exploitation", "Maltreatment",
];

const ABUSE_PERPETRATOR = [
  "Staff", "Family or host", "Another client", "Community member", "Unknown",
];

const MED_ERROR_TYPES = [
  "Missed dose", "Wrong medication", "Wrong dose", "Wrong time",
  "Wrong person", "Wrong route", "Refusal not documented",
];

const TRANSPORT = ["ER", "Urgent care", "Clinic", "None"];

export const DETAIL_BLOCKS: Record<DetailCategoryKey, DetailBlock> = {
  abuse: {
    key: "abuse",
    title: "Abuse / neglect / exploitation — required details",
    notice: {
      tone: "red",
      text:
        `Utah law requires the person with direct knowledge to PERSONALLY report ` +
        `suspected abuse, neglect, or exploitation of a vulnerable adult to Adult ` +
        `Protective Services — this duty cannot be delegated. APS intake: ` +
        `${APS_HOTLINE} (verify with current state listing).`,
    },
    fields: [
      { name: "suspectedOrObserved", label: "Suspected or directly observed?", type: "select",
        required: true, options: ["Suspected", "Directly observed"] },
      { name: "abuseType", label: "Type", type: "select", required: true, options: ABUSE_TYPES },
      { name: "perpetrator", label: "Alleged perpetrator relationship", type: "select",
        required: true, options: ABUSE_PERPETRATOR },
      { name: "apsNotifiedStatus", label: "APS notified?", type: "select",
        required: true, options: ["Yes", "Not yet"] },
      { name: "apsNotifiedBy", label: "APS notification — by whom (person with direct knowledge)",
        type: "text" },
      { name: "apsNotifiedAt", label: "APS notification — date/time", type: "datetime" },
      { name: "apsReference", label: "APS reference # (if provided)", type: "text" },
      { name: "policeNotified", label: "Police notified? (if crime suspected)", type: "yesno" },
      { name: "policeAgency", label: "Police agency", type: "text" },
      { name: "policeReportNumber", label: "Police report #", type: "text" },
      { name: "immediateProtections", label: "Immediate protections put in place",
        type: "textarea", required: true, rows: 3 },
    ],
  },

  injury: {
    key: "injury",
    title: "Injury — required details",
    fields: [
      { name: "bodyLocations", label: "Body location(s)", type: "multiselect",
        required: true, options: BODY_LOCATIONS },
      { name: "injuryType", label: "Injury type", type: "select",
        required: true, options: INJURY_TYPES },
      { name: "severity", label: "Severity / treatment level", type: "select",
        required: true, options: INJURY_SEVERITY },
      { name: "suspectedCause", label: "Suspected cause", type: "textarea", rows: 2 },
      { name: "photos", label: "Photos (optional, multiple)", type: "photos", max: 8 },
    ],
  },

  medication_error: {
    key: "medication_error",
    title: "Medication error — required details",
    fields: [
      { name: "errorType", label: "Error type", type: "select",
        required: true, options: MED_ERROR_TYPES },
      { name: "medicationName", label: "Medication name", type: "text", required: true },
      { name: "prescribedVsActual", label: "What was prescribed vs what happened",
        type: "textarea", required: true, rows: 3 },
      { name: "poisonControl", label: "Poison Control contacted?", type: "yesno_na" },
      { name: "prescriberNotified", label: "Prescriber or pharmacy notified — who/when",
        type: "textarea", rows: 2 },
      { name: "symptoms", label: "Symptoms observed", type: "textarea", rows: 2 },
      { name: "marCorrected", label: "MAR corrected? (open the client's eMAR to fix)",
        type: "yesno" },
    ],
  },

  medical: {
    key: "medical",
    title: "Medical emergency / unplanned medical visit — required details",
    fields: [
      { name: "symptomOnset", label: "Symptom onset and description",
        type: "textarea", required: true, rows: 3 },
      { name: "called911", label: "911 called?", type: "yesno", required: true },
      { name: "transportedTo", label: "Transported to", type: "select",
        required: true, options: TRANSPORT },
      { name: "transportedBy", label: "Transported by whom", type: "text" },
      { name: "outcomeOrDiagnosis", label: "Outcome / diagnosis (if known)",
        type: "textarea", rows: 2 },
      { name: "dischargeInstructions", label: "Discharge instructions received? (if yes, complete the Medical Appointment Record)",
        type: "yesno" },
      { name: "followUpNeeded", label: "Follow-up appointment needed?", type: "yesno" },
    ],
  },

  missing: {
    key: "missing",
    title: "Missing person / elopement — required details",
    fields: [
      { name: "lastSeenAt", label: "Last seen date/time", type: "datetime", required: true },
      { name: "lastSeenLocation", label: "Last seen location", type: "text", required: true },
      { name: "discoveryMethod", label: "How was the absence discovered?",
        type: "textarea", required: true, rows: 2 },
      { name: "searchActions", label: "Search actions taken",
        type: "textarea", required: true, rows: 3 },
      { name: "supervisorNotifiedAt", label: "Supervisor notified at",
        type: "datetime", required: true },
      { name: "leContacted", label: "Law enforcement contacted?", type: "yesno", required: true },
      { name: "leAgency", label: "Law enforcement — agency", type: "text" },
      { name: "leReportNumber", label: "Law enforcement — report #", type: "text" },
      { name: "found", label: "Found?", type: "yesno" },
      { name: "foundAt", label: "Found — date/time", type: "datetime" },
      { name: "foundLocation", label: "Found — location", type: "text" },
      { name: "foundCondition", label: "Condition when found", type: "textarea", rows: 2 },
    ],
  },

  behavior: {
    key: "behavior",
    title: "Extreme behavior episode — required details",
    fields: [
      { name: "antecedent", label: "What preceded it (antecedent)",
        type: "textarea", required: true, rows: 2 },
      { name: "behaviorsObserved", label: "Behaviors observed",
        type: "textarea", required: true, rows: 2 },
      { name: "durationMinutes", label: "Approximate duration (minutes)", type: "text", required: true },
      { name: "deescalation", label: "De-escalation techniques used",
        type: "textarea", required: true, rows: 2 },
      { name: "restraintUsed", label: "Restraint used?", type: "yesno", required: true },
      { name: "holdType", label: "Type of hold (if restraint used)", type: "text" },
      { name: "restraintDuration", label: "Restraint duration (if restraint used)", type: "text" },
      { name: "restraintAuthorizedBy", label: "Authorized by (if restraint used)", type: "text" },
      { name: "injuriesToAnyone", label: "Injuries to anyone (links to Injury fields)",
        type: "textarea", rows: 2 },
      { name: "propertyDamage", label: "Property damage", type: "textarea", rows: 2 },
    ],
  },

  police: {
    key: "police",
    title: "Police involvement — required details",
    fields: [
      { name: "agency", label: "Agency", type: "text", required: true },
      { name: "officerNames", label: "Officer names / badge (if known)", type: "text" },
      { name: "reportNumber", label: "Report #", type: "text" },
      { name: "reason", label: "Reason for involvement",
        type: "textarea", required: true, rows: 2 },
      { name: "outcome", label: "Outcome", type: "select", required: true,
        options: ["Welfare check", "Citation", "Arrest", "Report only"] },
    ],
  },

  fatality: {
    key: "fatality",
    title: "Death / fatality — required details",
    fields: [
      { name: "discoveredAt", label: "Discovered date/time", type: "datetime", required: true },
      { name: "pronouncedBy", label: "Pronounced by", type: "text", required: true },
      { name: "coronerContacted", label: "Coroner / medical examiner contacted",
        type: "yesno", required: true },
      { name: "policeContacted", label: "Police contacted", type: "yesno", required: true },
      { name: "dnrPolst", label: "DNR or POLST on file?", type: "yesno", required: true },
    ],
  },

  property: {
    key: "property",
    title: "Property damage / Theft / Vehicle accident — required details",
    fields: [
      { name: "damageDescription", label: "Description of damage or loss",
        type: "textarea", required: true, rows: 3 },
      { name: "estimatedValue", label: "Estimated value (USD)", type: "text" },
      { name: "policeReportNumber", label: "Police report # (theft / vehicle)", type: "text" },
      { name: "insuranceNotified", label: "Insurance notified (vehicle)", type: "yesno_na" },
      { name: "injuries", label: "Injuries? (links to Injury fields)",
        type: "textarea", rows: 2 },
    ],
  },
};
