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
  "fall", "fell", "injury", "injured", "hurt", "bruise", "bleeding",
  "ER", "emergency", "hospital", "911", "police", "missing", "eloped",
  "ran away", "restraint", "hit", "bit", "aggression", "seizure",
  "choking", "med error", "wrong medication", "missed dose", "abuse",
  "neglect", "suicidal", "self-harm", "death", "died",
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
  // Reset lastIndex because we use the /g flag.
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
    ? "Confirm no reportable incident occurred"
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
