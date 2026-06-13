/**
 * Deterministic, on-device note scanner for residential & shift-note flows.
 *
 * NO AI gateway call, NO note text leaves the browser. The lexicons below
 * are the authoritative trigger surface for HHS daily notes (host) and the
 * punch-pad clock-out compliance note (RHS + all hourly shifts). When a
 * lexicon matches, the caller MUST surface the trigger prompt and block
 * submission until the user either opens the prefilled form or records an
 * explicit dismissal with a reason.
 */

import {
  type DetailCategoryKey,
  ABUSE_CATEGORY_NAME,
  INJURY_CATEGORY_NAME,
  MEDICATION_ERROR_CATEGORY_NAME,
  MEDICAL_EMERGENCY_CATEGORY_NAME,
  BEHAVIOR_CATEGORY_NAME,
  POLICE_CATEGORY_NAME,
  MISSING_CATEGORY_NAME,
  FATALITY_CATEGORY_NAME,
} from "./incident-detail-schemas";

export type TriggerKind = "incident" | "appointment";

export type NoteTriggerHit = {
  kind: TriggerKind;
  /** The exact (lower-cased) lexicon term that fired. Used in the prompt. */
  term: string;
};

// Word-boundary, case-insensitive lexicons. Multi-word entries are matched
// as phrases. Keep these EXACTLY as authored — they encode the agency's
// must-report surface, not heuristics.
const INCIDENT_TERMS = [
  "fall", "fell", "injury", "injured", "hurt", "bruise", "bruised",
  "swelling", "swollen", "bleeding", "bled",
  "ER", "emergency", "hospital", "911", "ambulance", "paramedic",
  "police", "officer", "missing", "eloped",
  "ran away", "restraint", "restrained", "hit", "bit", "aggression",
  "seizure", "choking", "med error", "wrong medication", "wrong med",
  "missed dose", "wrong dose", "abuse", "neglect", "exploitation",
  "APS", "suicidal", "self-harm", "death", "died", "deceased",
  "unresponsive", "passed away",
] as const;

const APPOINTMENT_TERMS = [
  "doctor", "dentist", "appointment", "clinic", "follow-up",
  "prescription", "pharmacy", "therapy session", "specialist",
  "urgent care",
] as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLexiconRegex(terms: ReadonlyArray<string>): RegExp {
  // \b doesn't play well with terms ending in punctuation (e.g. "self-harm"
  // has a hyphen). Use lookarounds bounded by non-word chars / start/end.
  const alts = terms.map(escapeRegex).join("|");
  return new RegExp(`(?<![A-Za-z0-9])(?:${alts})(?![A-Za-z0-9])`, "gi");
}

const INCIDENT_RX = buildLexiconRegex(INCIDENT_TERMS);
const APPOINTMENT_RX = buildLexiconRegex(APPOINTMENT_TERMS);

/**
 * Scan a note for incident + appointment triggers. Returns at most ONE hit
 * per kind (the first matched term, lower-cased). Empty input → [].
 */
export function scanNoteForTriggers(text: string | null | undefined): NoteTriggerHit[] {
  if (!text || !text.trim()) return [];
  const hits: NoteTriggerHit[] = [];
  INCIDENT_RX.lastIndex = 0;
  APPOINTMENT_RX.lastIndex = 0;
  const incMatch = INCIDENT_RX.exec(text);
  if (incMatch) hits.push({ kind: "incident", term: incMatch[0].toLowerCase() });
  const apptMatch = APPOINTMENT_RX.exec(text);
  if (apptMatch) hits.push({ kind: "appointment", term: apptMatch[0].toLowerCase() });
  return hits;
}

export function triggerLabel(kind: TriggerKind): string {
  return kind === "incident" ? "An Incident Report" : "An Appointment Log";
}

export function triggerDismissPrompt(kind: TriggerKind): string {
  return kind === "incident"
    ? "No reportable incident occurred"
    : "Confirm no appointment to log";
}

/** Stable dismissal key for user_ui_dismissals. */
export function triggerDismissalKey(
  kind: TriggerKind,
  clientId: string,
  date: string,
): string {
  return `nectar_trigger:${kind}:${clientId}:${date}`;
}

// ---------------------------------------------------------------------------
// Live narrative category scanner — drives in-form Nectar nudges that point
// staff to the right category-detail block. Same on-device rule: no API.
// ---------------------------------------------------------------------------

export type NarrativeCategoryHit = {
  term: string;
  categoryKey: DetailCategoryKey;
  categoryName: string;
  /** When true, the hit also implies the behavior-restraint flag. */
  flagsRestraint?: boolean;
};

const NARRATIVE_TERMS: ReadonlyArray<{
  terms: ReadonlyArray<string>;
  categoryKey: DetailCategoryKey;
  categoryName: string;
  flagsRestraint?: boolean;
}> = [
  {
    terms: ["bruise", "bruised", "swelling", "swollen", "cut", "laceration",
            "bleeding", "bled", "scratch", "abrasion", "fall", "fell", "hurt",
            "injured", "injury"],
    categoryKey: "injury",
    categoryName: INJURY_CATEGORY_NAME,
  },
  {
    terms: ["wrong medication", "wrong med", "wrong dose", "missed dose",
            "med error", "wrong pill", "refused medication"],
    categoryKey: "medication_error",
    categoryName: MEDICATION_ERROR_CATEGORY_NAME,
  },
  {
    terms: ["restraint", "restrained", "physical hold", "held him down",
            "held her down"],
    categoryKey: "behavior",
    categoryName: BEHAVIOR_CATEGORY_NAME,
    flagsRestraint: true,
  },
  {
    terms: ["abuse", "neglect", "exploitation", "APS"],
    categoryKey: "abuse",
    categoryName: ABUSE_CATEGORY_NAME,
  },
  {
    terms: ["911", "ambulance", "paramedic", "unresponsive", "seizure",
            "choking", "ER", "hospital"],
    categoryKey: "medical",
    categoryName: MEDICAL_EMERGENCY_CATEGORY_NAME,
  },
  {
    terms: ["police", "officer", "arrested", "citation"],
    categoryKey: "police",
    categoryName: POLICE_CATEGORY_NAME,
  },
  {
    terms: ["missing", "eloped", "ran away", "unaccounted"],
    categoryKey: "missing",
    categoryName: MISSING_CATEGORY_NAME,
  },
  {
    terms: ["died", "deceased", "death", "passed away"],
    categoryKey: "fatality",
    categoryName: FATALITY_CATEGORY_NAME,
  },
];

const NARRATIVE_RXS = NARRATIVE_TERMS.map((g) => ({
  ...g,
  rx: buildLexiconRegex(g.terms),
}));

/**
 * Scan the narrative text and return ALL distinct category hits (first
 * matched term per category). Used for in-form Nectar nudges that point the
 * writer at the missing category-detail block.
 */
export function scanNarrativeForCategories(
  text: string | null | undefined,
): NarrativeCategoryHit[] {
  if (!text || !text.trim()) return [];
  const out: NarrativeCategoryHit[] = [];
  for (const g of NARRATIVE_RXS) {
    g.rx.lastIndex = 0;
    const m = g.rx.exec(text);
    if (m) {
      out.push({
        term: m[0].toLowerCase(),
        categoryKey: g.categoryKey,
        categoryName: g.categoryName,
        flagsRestraint: g.flagsRestraint,
      });
    }
  }
  return out;
}
