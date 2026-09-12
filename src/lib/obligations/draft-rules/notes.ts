/**
 * REQ-1.10(7) note / service-article templates (draft simulation).
 * General schema unless an explicit service-specific override is encoded.
 * Form fields are ALL unless the source marks them CONDITIONAL.
 * Select by the actual service code + service date. Do not invent schemas.
 */

import { isDailyServiceCode } from "../../service-billing.ts";
import type { MemberCondition, NoteFieldSpec, ServiceNoteTemplate } from "./types.ts";

/** DHHS91172 effective date. Pre-cutover dates have no invented historical schema. */
export const NOTE_SCHEMA_EFFECTIVE_FROM = "2026-07-01";

const GENERAL_FIELDS: ServiceNoteTemplate["fields"] = [
  { id: "person", label: "Person", requirement: "ALL" },
  { id: "date", label: "Date", requirement: "ALL" },
  { id: "service_code", label: "Service code", requirement: "ALL" },
  { id: "staff", label: "Staff", requirement: "ALL" },
  { id: "summary_note", label: "Summary note", requirement: "ALL" },
  {
    id: "start_end_time",
    label: "Start/end time (quarter-hour codes)",
    requirement: "CONDITIONAL",
    condition: "quarter_hour_code",
  },
];

/**
 * General five-field daily note (Person, date, service code, staff, summary)
 * plus conditional start/end for quarter-hour codes (CST 55 & 56).
 */
export const GENERAL_NOTE_TEMPLATE: ServiceNoteTemplate = {
  id: "note-general-1.10.7",
  label: "General service-documentation note",
  serviceCodes: [],
  effectiveFrom: NOTE_SCHEMA_EFFECTIVE_FROM,
  effectiveTo: null,
  fields: GENERAL_FIELDS,
  sourceClauseId: "SOW §1.10(7)",
};

/**
 * HHS override already encoded on the live pack: host-home daily note +
 * overnight confirmation (no overnight stay = unbillable). Not a 5-field punch note.
 */
export const HHS_NOTE_TEMPLATE: ServiceNoteTemplate = {
  id: "note-hhs-article-11",
  label: "HHS daily note (host-home summary)",
  serviceCodes: ["HHS"],
  effectiveFrom: NOTE_SCHEMA_EFFECTIVE_FROM,
  effectiveTo: null,
  fields: [
    { id: "person", label: "Person", requirement: "ALL" },
    { id: "date", label: "Date", requirement: "ALL" },
    { id: "attendance", label: "Attendance (Present)", requirement: "ALL" },
    { id: "daily_note", label: "Daily note", requirement: "ALL" },
    {
      id: "overnight_confirmation",
      label: "Overnight stay confirmation",
      requirement: "ALL",
    },
  ],
  sourceClauseId: "SOW Article 11",
};

export const SERVICE_NOTE_TEMPLATES: readonly ServiceNoteTemplate[] = [
  HHS_NOTE_TEMPLATE,
  GENERAL_NOTE_TEMPLATE,
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function inEffect(template: ServiceNoteTemplate, serviceDate: string): boolean {
  if (!ISO_DAY.test(serviceDate)) return false;
  if (serviceDate < template.effectiveFrom) return false;
  if (template.effectiveTo && serviceDate > template.effectiveTo) return false;
  return true;
}

/**
 * Pick the note template for the actual service code on the service date.
 * Explicit overrides win. No matching effective template → null (missing-information).
 */
export function selectNoteTemplate(
  serviceCode: string | null | undefined,
  serviceDate: string,
  templates: readonly ServiceNoteTemplate[] = SERVICE_NOTE_TEMPLATES,
): ServiceNoteTemplate | null {
  const code = (serviceCode ?? "").trim().toUpperCase();
  if (!code || !ISO_DAY.test(serviceDate)) return null;
  const effective = templates.filter((t) => inEffect(t, serviceDate));
  const override = effective.find((t) => t.serviceCodes.some((c) => c.toUpperCase() === code));
  if (override) return override;
  const general = effective.find((t) => t.serviceCodes.length === 0);
  return general ?? null;
}

function conditionKnown(
  condition: MemberCondition | undefined,
  serviceCode: string,
): { applicable: boolean; unanswered: boolean } {
  if (!condition) return { applicable: true, unanswered: false };
  if (condition === "quarter_hour_code") {
    return { applicable: !isDailyServiceCode(serviceCode), unanswered: false };
  }
  if (condition === "hhs_daily_note") {
    return { applicable: serviceCode.toUpperCase() === "HHS", unanswered: false };
  }
  if (condition === "evv_mandated_code") {
    return { applicable: false, unanswered: false };
  }
  return { applicable: true, unanswered: false };
}

export function requiredNoteFields(
  template: ServiceNoteTemplate,
  serviceCode: string,
): NoteFieldSpec[] {
  return template.fields.filter((field) => {
    if (field.requirement === "ALL") return true;
    const cond = conditionKnown(field.condition, serviceCode);
    return cond.applicable;
  });
}

function fieldFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export type NoteFieldValues = Record<string, unknown>;

export type NoteCompleteness = {
  templateId: string;
  templateLabel: string;
  complete: boolean;
  missingFieldIds: string[];
  requiredFieldIds: string[];
  wrongTemplate: boolean;
};

/**
 * Completeness against the template selected for the actual code + date.
 * A submitted template id that does not match is a wrong-template miss.
 */
export function evaluateNoteCompleteness(input: {
  serviceCode: string;
  serviceDate: string;
  fields: NoteFieldValues;
  submittedTemplateId?: string | null;
  templates?: readonly ServiceNoteTemplate[];
}): NoteCompleteness | { missingTemplate: true; message: string } {
  const selected = selectNoteTemplate(input.serviceCode, input.serviceDate, input.templates);
  if (!selected) {
    return {
      missingTemplate: true,
      message:
        "No note template is effective for this service code and service date — missing-information, never invent a historical schema.",
    };
  }
  const required = requiredNoteFields(selected, input.serviceCode.trim().toUpperCase());
  const missingFieldIds = required.filter((f) => !fieldFilled(input.fields[f.id])).map((f) => f.id);
  const wrongTemplate = !!input.submittedTemplateId && input.submittedTemplateId !== selected.id;
  return {
    templateId: selected.id,
    templateLabel: selected.label,
    complete: missingFieldIds.length === 0 && !wrongTemplate,
    missingFieldIds,
    requiredFieldIds: required.map((f) => f.id),
    wrongTemplate,
  };
}

export type IndependentLaneStatus = "separate_incomplete" | "separate_complete" | "unanswered";

export function independentLaneStatus(
  satisfied: boolean | null | undefined,
): IndependentLaneStatus {
  if (satisfied == null) return "unanswered";
  return satisfied ? "separate_complete" : "separate_incomplete";
}
