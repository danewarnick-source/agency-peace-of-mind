// Tri-state confirmation for tracked client fields.
//   has     — real data exists (value present OR rows in a related table)
//   none    — admin has confirmed the client genuinely has none
//   unknown — nothing provided, not yet confirmed → NECTAR asks
//
// The single jsonb column `clients.field_confirmations` stores the admin's
// "none" / "has" answers. The "has" state is derived primarily from real
// data; the explicit "has" entry exists so a Yes-answered field that hasn't
// had data entered yet still reads as needs-data (not "unknown").

export type FieldState = "has" | "none" | "unknown";

export type TrackedField = {
  key: string;
  label: string;
  /** Phrased as the question NECTAR asks the admin. */
  question: string;
  positiveStatement: string; // shown on profile when state === "none"
};

export const TRACKED_FIELDS: TrackedField[] = [
  { key: "medications", label: "Medications",
    question: "No medications were found in the uploaded documents. Does this client take any medications?",
    positiveStatement: "Client does not take medications." },
  { key: "allergies", label: "Allergies",
    question: "No allergies were found. Does this client have any known allergies?",
    positiveStatement: "No known allergies." },
  { key: "dysphagia", label: "Dysphagia",
    question: "Does this client have dysphagia (swallowing difficulty)?",
    positiveStatement: "No dysphagia." },
  { key: "swallowing_alerts", label: "Swallowing alerts",
    question: "Are there any swallowing alerts for this client?",
    positiveStatement: "No swallowing alerts." },
  { key: "diagnoses", label: "Diagnoses",
    question: "No diagnoses were found. Does this client have diagnoses on file?",
    positiveStatement: "No diagnoses recorded." },
  { key: "chronic_conditions", label: "Chronic conditions",
    question: "Does this client have any chronic conditions?",
    positiveStatement: "No chronic conditions." },
  { key: "advanced_directives", label: "Advanced directives",
    question: "Are there advanced directives on file for this client?",
    positiveStatement: "No advanced directives on file (confirmed)." },
  { key: "emergency_medical_treatment_authorization", label: "Emergency medical treatment authorization",
    question: "Is an emergency medical treatment authorization on file?",
    positiveStatement: "No emergency medical treatment authorization on file (confirmed)." },
  { key: "immunizations", label: "Immunizations",
    question: "Are immunization records on file?",
    positiveStatement: "No immunization records on file (confirmed)." },
  { key: "bsp_status", label: "Behavior support plan",
    question: "Does this client have a behavior support plan (BSP)?",
    positiveStatement: "No behavior support plan." },
  { key: "rights_restrictions", label: "Rights restrictions",
    question: "Are there any rights restrictions for this client?",
    positiveStatement: "No rights restrictions." },
  { key: "clinical_alert", label: "Clinical alert / special directions",
    question: "Are there any clinical alerts or special directions staff must know?",
    positiveStatement: "No clinical alerts." },
  { key: "court_orders", label: "Court orders",
    question: "Are there any court orders for this client?",
    positiveStatement: "No court orders." },
  { key: "guardian", label: "Guardian",
    question: "Is this client their own guardian, or do they have a separate guardian?",
    positiveStatement: "Client is their own guardian." },
  { key: "grievance_acknowledged", label: "Grievance policy acknowledged",
    question: "Has the client / representative acknowledged the grievance policy in writing? (SOW §1.10(11))",
    positiveStatement: "Grievance policy acknowledgment on file." },
  { key: "dnr_status", label: "DNR",
    question: "Does this client have a Do-Not-Resuscitate order on file?",
    positiveStatement: "No DNR on file." },
  { key: "polst_status", label: "POLST",
    question: "Does this client have a POLST on file?",
    positiveStatement: "No POLST on file." },
  { key: "palliative_care_status", label: "Palliative care",
    question: "Does this client have palliative-care orders on file?",
    positiveStatement: "No palliative-care orders on file." },
  { key: "hospice_status", label: "Hospice",
    question: "Does this client have hospice protocols on file?",
    positiveStatement: "No hospice protocols on file." },
];

export const TRACKED_KEYS = TRACKED_FIELDS.map((f) => f.key);

/**
 * Pure derivation: given the confirmations map and a hasData boolean for
 * the field, return the tri-state value.
 */
export function fieldState(
  confirmations: Record<string, string> | null | undefined,
  key: string,
  hasData: boolean,
): FieldState {
  if (hasData) return "has";
  const c = confirmations?.[key];
  if (c === "none") return "none";
  if (c === "has") return "has"; // admin said yes, data not entered yet
  return "unknown";
}
