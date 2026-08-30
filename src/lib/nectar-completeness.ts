import { NECTAR_DRAFT_MIN_WORDS, countNoteWords } from "./nectar-note-gate.ts";

/** The four submit-time completeness items. Word count is local; the rest use NECTAR. */
export const COMPLETENESS_KEYS = [
  "word_count",
  "client_referenced",
  "support_provided",
  "client_response",
] as const;

export type CompletenessKey = (typeof COMPLETENESS_KEYS)[number];

export interface CompletenessItem {
  key: CompletenessKey;
  passed: boolean;
  message: string;
}

export interface CompletenessResult {
  status: "Verified" | "Flagged";
  feedback: string;
  checks: CompletenessItem[];
}

export const COMPLETENESS_LABELS: Record<CompletenessKey, string> = {
  word_count: "30-word minimum",
  client_referenced: "Correct client is referenced",
  support_provided: "Support provided to the client",
  client_response: "Client's response is documented",
};

export const COMPLETENESS_PASS_FEEDBACK =
  "NECTAR completeness check passed: 30 words, client referenced, support documented, client response documented.";

export function localWordCountCheck(text: string): CompletenessItem {
  const words = countNoteWords(text);
  const passed = words >= NECTAR_DRAFT_MIN_WORDS;
  return {
    key: "word_count",
    passed,
    message: passed
      ? `Word count met (${words} words).`
      : `Note is ${words} word${words === 1 ? "" : "s"} — write at least ${NECTAR_DRAFT_MIN_WORDS} words.`,
  };
}

export function failedCompletenessChecks(checks: CompletenessItem[]): CompletenessItem[] {
  return checks.filter((c) => !c.passed);
}

export function completenessFromChecks(checks: CompletenessItem[]): CompletenessResult {
  const ordered = COMPLETENESS_KEYS.map((key) => {
    const found = checks.find((c) => c.key === key);
    return (
      found ?? {
        key,
        passed: false,
        message: `${COMPLETENESS_LABELS[key]} was not evaluated. Try Submit again.`,
      }
    );
  });
  const failed = failedCompletenessChecks(ordered);
  if (failed.length === 0) {
    return { status: "Verified", feedback: COMPLETENESS_PASS_FEEDBACK, checks: ordered };
  }
  return {
    status: "Flagged",
    feedback: failed.map((c) => c.message).join(" "),
    checks: ordered,
  };
}

function asCheckObject(value: unknown): { passed?: unknown; message?: unknown } {
  if (value && typeof value === "object") return value as { passed?: unknown; message?: unknown };
  return {};
}

/** Parse NECTAR's 3 AI completeness items. Word count is applied by the caller. */
export function parseNectarCompletenessPayload(raw: unknown): CompletenessItem[] {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keys: Array<Exclude<CompletenessKey, "word_count">> = [
    "client_referenced",
    "support_provided",
    "client_response",
  ];
  return keys.map((key) => {
    const item = asCheckObject(obj[key]);
    const passed = item.passed === true;
    const message =
      typeof item.message === "string" && item.message.trim().length > 0
        ? item.message.trim()
        : passed
          ? `${COMPLETENESS_LABELS[key]} is documented.`
          : `Add ${COMPLETENESS_LABELS[key].toLowerCase()}.`;
    return { key, passed, message };
  });
}

export function mergeLocalAndNectarChecks(
  narrative: string,
  nectarChecks: CompletenessItem[],
): CompletenessResult {
  return completenessFromChecks([localWordCountCheck(narrative), ...nectarChecks]);
}
