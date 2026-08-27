/**
 * Compass voice-agent intent shapes and post-Bedrock reconciliation.
 *
 * Bedrock is asked to return one JSON object, but a single utterance can
 * mean BOTH "here is my shift note" AND "take me to clock-out." This module
 * is the safety net so neither half is dropped, and so a bare "clock me out"
 * never invents a note.
 *
 * Clock-out writes still happen on the punch pad. Compass must not auto-submit
 * or tick attestation / meds / GPS checkboxes.
 */

export type VoiceAgentResponse =
  | { intent: "expand_note"; narrative: string }
  | { intent: "expand_note_and_clock_out"; narrative: string }
  | { intent: "clock_in"; clientId: string; clientName: string; serviceCode: string }
  | { intent: "clock_out" }
  | { intent: "ask_compass"; question: string }
  | { intent: "clarify"; question: string }
  | { intent: "unknown"; message: string };

export const FALLBACK_UNKNOWN: Extract<VoiceAgentResponse, { intent: "unknown" }> = {
  intent: "unknown",
  message: "Compass couldn't understand that — please try again.",
};

/** Spoken requests to end the current shift (not "clock in"). */
export const CLOCK_OUT_CUE_RE =
  /\b(?:(?:please\s+)?(?:clock|punch)(?:\s+me)?\s+out|(?:please\s+)?end(?:\s+my)?\s+shift)\b/gi;

const LEADING_GLUE_RE = /^(and|also|then|so|please|thanks|thank you|okay|ok)[,.\s]+/i;
const TRAILING_GLUE_RE = /[,.\s]+(and|also|then|please|thanks|thank you|okay|ok)$/i;

export function hasClockOutCue(text: string): boolean {
  CLOCK_OUT_CUE_RE.lastIndex = 0;
  return CLOCK_OUT_CUE_RE.test(text);
}

export function stripClockOutCues(text: string): string {
  CLOCK_OUT_CUE_RE.lastIndex = 0;
  return text.replace(CLOCK_OUT_CUE_RE, " ").replace(/\s+/g, " ").trim();
}

/**
 * Note body remaining after clock-out phrases are stripped.
 * Returns null when leftover is too thin to be real documentation
 * (so "Clock me out please" does not become a fabricated note).
 */
export function extractNoteNarrative(text: string): string | null {
  const leftover = stripClockOutCues(text)
    .replace(LEADING_GLUE_RE, "")
    .replace(TRAILING_GLUE_RE, "")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();
  if (leftover.length < 8) return null;
  return leftover;
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

/**
 * Coerces Bedrock's parsed JSON into the strict VoiceAgentResponse union.
 * Extra fields on exclusive intents (narrative on clock_out, clockOut on
 * expand_note) are folded into expand_note_and_clock_out when they carry
 * real note content.
 */
export function normalizeVoiceAgentResponse(parsed: Record<string, unknown>): VoiceAgentResponse {
  const intent = typeof parsed.intent === "string" ? parsed.intent : "";
  const rawNarrative = typeof parsed.narrative === "string" ? parsed.narrative.trim() : "";
  const cleanedNarrative = rawNarrative ? extractNoteNarrative(rawNarrative) : null;

  if (intent === "expand_note_and_clock_out") {
    if (cleanedNarrative)
      return { intent: "expand_note_and_clock_out", narrative: cleanedNarrative };
    if (rawNarrative) return { intent: "expand_note_and_clock_out", narrative: rawNarrative };
  }

  if (intent === "expand_note") {
    const alsoClockOut =
      truthyFlag(parsed.clockOut) ||
      truthyFlag(parsed.alsoClockOut) ||
      truthyFlag(parsed.clock_out);
    if (rawNarrative) {
      const narrative = cleanedNarrative ?? rawNarrative;
      if (alsoClockOut) return { intent: "expand_note_and_clock_out", narrative };
      return { intent: "expand_note", narrative: rawNarrative };
    }
  }

  if (intent === "clock_in") {
    const clientId = typeof parsed.clientId === "string" ? parsed.clientId : "";
    const serviceCode =
      typeof parsed.serviceCode === "string" ? parsed.serviceCode.toUpperCase() : "";
    const clientName = typeof parsed.clientName === "string" ? parsed.clientName.trim() : "";
    if (clientId && serviceCode) {
      return { intent: "clock_in", clientId, clientName: clientName || "this client", serviceCode };
    }
  }

  if (intent === "clock_out") {
    if (cleanedNarrative)
      return { intent: "expand_note_and_clock_out", narrative: cleanedNarrative };
    return { intent: "clock_out" };
  }

  if (intent === "ask_compass") {
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (question) return { intent: "ask_compass", question };
  }

  if (intent === "clarify") {
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (question) return { intent: "clarify", question };
  }

  if (intent === "unknown") {
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";
    return { intent: "unknown", message: message || FALLBACK_UNKNOWN.message };
  }

  return FALLBACK_UNKNOWN;
}

/**
 * Merge exclusive Bedrock picks with the actual transcript so a combined
 * utterance cannot lose its note or its clock-out request.
 *
 * - Note + clock-out cue → expand_note_and_clock_out (never invent a note
 *   from the clock-out phrase itself).
 * - Clock-out cue only → clock_out.
 * - Note only → leave expand_note (or whatever Bedrock returned) alone.
 */
export function reconcileVoiceAgentResponse(
  parsed: Record<string, unknown>,
  transcript: string,
): VoiceAgentResponse {
  const normalized = normalizeVoiceAgentResponse(parsed);
  const wantsClockOut = hasClockOutCue(transcript);
  const noteFromTranscript = extractNoteNarrative(transcript);

  if (normalized.intent === "expand_note_and_clock_out") {
    const cleaned = extractNoteNarrative(normalized.narrative) ?? noteFromTranscript;
    if (cleaned) return { intent: "expand_note_and_clock_out", narrative: cleaned };
    return { intent: "clock_out" };
  }

  if (normalized.intent === "clock_out") {
    if (noteFromTranscript) {
      return { intent: "expand_note_and_clock_out", narrative: noteFromTranscript };
    }
    return { intent: "clock_out" };
  }

  if (normalized.intent === "expand_note") {
    if (wantsClockOut) {
      const cleaned = extractNoteNarrative(normalized.narrative) ?? noteFromTranscript;
      if (cleaned) return { intent: "expand_note_and_clock_out", narrative: cleaned };
      return { intent: "clock_out" };
    }
    return normalized;
  }

  // Salvage a dropped combined / bare clock-out when Bedrock returned
  // unknown or clarify but the transcript is unambiguous.
  if ((normalized.intent === "unknown" || normalized.intent === "clarify") && wantsClockOut) {
    if (noteFromTranscript) {
      return { intent: "expand_note_and_clock_out", narrative: noteFromTranscript };
    }
    return { intent: "clock_out" };
  }

  return normalized;
}
