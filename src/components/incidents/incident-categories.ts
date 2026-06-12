/**
 * Single editable list of incident categories surfaced in the IR form and
 * the admin queue filters. Mirrors what an administrator must select when
 * typing the matching record into UPI. Abuse/neglect/exploitation triggers
 * the prevention-strategies requirement (§1.27(3)); Death/fatality routes
 * to the §1.26 banner.
 */
export const INCIDENT_CATEGORIES = [
  "Injury",
  "Unplanned medical visit (ER/urgent care)",
  "Medical emergency",
  "Medication error",
  "Extreme behavior episode",
  "Property damage",
  "Police involvement",
  "Theft",
  "Vehicle accident",
  "Missing person / elopement",
  "Abuse, neglect, or exploitation",
  "Death/fatality",
  "Other",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const ABUSE_CATEGORY: IncidentCategory = "Abuse, neglect, or exploitation";
export const FATALITY_CATEGORY: IncidentCategory = "Death/fatality";

export const GUARDIAN_METHODS = ["phone", "email", "face-to-face"] as const;
export type GuardianMethod = (typeof GUARDIAN_METHODS)[number];
