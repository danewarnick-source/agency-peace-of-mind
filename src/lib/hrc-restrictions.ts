/**
 * SOW §1.20 / HCBS Settings Rule — the eight required, individually-verifiable
 * elements for any client rights restriction. Each is its own field (not a
 * single freeform note) so completion can be checked element-by-element.
 */
export type RestrictionElementKey =
  | "consent"
  | "assessed_need"
  | "positive_interventions"
  | "less_intrusive_methods"
  | "condition_description"
  | "data_review"
  | "time_limits"
  | "no_harm";

export type RestrictionRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  restriction_title: string;
  active: boolean;
  consent_text: string | null;
  consent_signed_date: string | null;
  assessed_need_text: string | null;
  positive_interventions_text: string | null;
  less_intrusive_methods_text: string | null;
  condition_description_text: string | null;
  data_review_text: string | null;
  last_review_date: string | null;
  time_limits_text: string | null;
  next_review_date: string | null;
  no_harm_text: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RestrictionElementDef = {
  key: RestrictionElementKey;
  letter: string;
  label: string;
  description: string;
  textField: keyof RestrictionRecord;
  dateField: keyof RestrictionRecord | null;
  dateLabel: string | null;
};

export const RESTRICTION_ELEMENTS: RestrictionElementDef[] = [
  {
    key: "consent",
    letter: "a",
    label: "Informed consent",
    description: "Informed consent of the person, documented and signed.",
    textField: "consent_text",
    dateField: "consent_signed_date",
    dateLabel: "Date signed",
  },
  {
    key: "assessed_need",
    letter: "b",
    label: "Assessed need",
    description: "Specific, individualized assessed need, described in writing.",
    textField: "assessed_need_text",
    dateField: null,
    dateLabel: null,
  },
  {
    key: "positive_interventions",
    letter: "c",
    label: "Positive interventions tried first",
    description: "Positive interventions and supports used prior to the modification.",
    textField: "positive_interventions_text",
    dateField: null,
    dateLabel: null,
  },
  {
    key: "less_intrusive_methods",
    letter: "d",
    label: "Less intrusive methods tried",
    description: "Less intrusive methods tried that did not work.",
    textField: "less_intrusive_methods_text",
    dateField: null,
    dateLabel: null,
  },
  {
    key: "condition_description",
    letter: "e",
    label: "Condition description",
    description: "A clear description of the condition, directly proportionate to the assessed need.",
    textField: "condition_description_text",
    dateField: null,
    dateLabel: null,
  },
  {
    key: "data_review",
    letter: "f",
    label: "Data collection & review",
    description: "Regular data collection and review schedule, with the date of last review.",
    textField: "data_review_text",
    dateField: "last_review_date",
    dateLabel: "Date of last review",
  },
  {
    key: "time_limits",
    letter: "g",
    label: "Time limits & re-review",
    description: "Time limits set for periodic re-review, with the next re-review date.",
    textField: "time_limits_text",
    dateField: "next_review_date",
    dateLabel: "Next re-review date",
  },
  {
    key: "no_harm",
    letter: "h",
    label: "No-harm assurance",
    description: "Assurance that the intervention causes no harm to the individual.",
    textField: "no_harm_text",
    dateField: null,
    dateLabel: null,
  },
];

function hasContent(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0;
}

export function isElementComplete(record: RestrictionRecord, def: RestrictionElementDef): boolean {
  const text = record[def.textField] as string | null;
  if (!hasContent(text)) return false;
  if (def.dateField) {
    const date = record[def.dateField] as string | null;
    if (!hasContent(date)) return false;
  }
  return true;
}

export type RestrictionCompletion = {
  completedCount: number;
  total: number;
  isComplete: boolean;
  elements: Array<{ def: RestrictionElementDef; complete: boolean }>;
};

export function computeRestrictionCompletion(record: RestrictionRecord): RestrictionCompletion {
  const elements = RESTRICTION_ELEMENTS.map((def) => ({
    def,
    complete: isElementComplete(record, def),
  }));
  const completedCount = elements.filter((e) => e.complete).length;
  return {
    completedCount,
    total: RESTRICTION_ELEMENTS.length,
    isComplete: completedCount === RESTRICTION_ELEMENTS.length,
    elements,
  };
}
