/**
 * Create account must never toast "{}" or an empty object.
 * Dig a real sentence from Auth / RLS / server-fn payloads. No PHI.
 */

export const SIGNUP_EMAIL_IN_USE_MESSAGE = "That email is already in use. Sign in instead?";
export const SIGNUP_AGREEMENT_SAVE_FAILED_MESSAGE = "Couldn't save agreement. Stay on this page.";
export const SIGNUP_ACCOUNT_GENERIC_MESSAGE = "Couldn't create the account. Please try again.";

const EMPTY_TEXT = /^(?:\{\}|\[object Object\]|undefined|null|)$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pushCandidate(out: string[], value: unknown): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(String(value));
  }
}

/**
 * Walk Error / AuthError / Postgrest / TanStack server-fn shapes.
 * Never returns "{}" or "[object Object]".
 */
export function extractSignupErrorText(raw: unknown): string {
  const seen = new Set<unknown>();
  const parts: string[] = [];

  const walk = (value: unknown, depth: number): void => {
    if (value == null || depth > 5 || seen.has(value)) return;
    if (typeof value === "object") seen.add(value);

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || EMPTY_TEXT.test(trimmed)) return;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          walk(JSON.parse(trimmed) as unknown, depth + 1);
          return;
        } catch {
          parts.push(trimmed);
          return;
        }
      }
      parts.push(trimmed);
      return;
    }

    if (value instanceof Error) {
      walk(value.message, depth + 1);
      walk(value.cause, depth + 1);
      const extra = value as Error & { code?: unknown; details?: unknown; hint?: unknown };
      pushCandidate(parts, extra.code);
      walk(extra.details, depth + 1);
      walk(extra.hint, depth + 1);
      return;
    }

    const rec = asRecord(value);
    if (!rec) return;
    walk(rec.message, depth + 1);
    walk(rec.error, depth + 1);
    walk(rec.data, depth + 1);
    walk(rec.cause, depth + 1);
    walk(rec.details, depth + 1);
    walk(rec.hint, depth + 1);
    walk(rec.statusText, depth + 1);
    pushCandidate(parts, rec.code);
    pushCandidate(parts, rec.status);
  };

  walk(raw, 0);
  const joined = parts
    .map((p) => p.trim())
    .filter((p) => p && !EMPTY_TEXT.test(p))
    .join(" ");
  return joined;
}

export function isAlreadyUsedEmailError(raw: unknown): boolean {
  const text = extractSignupErrorText(raw).toLowerCase();
  if (!text) return false;
  if (
    /\balready (?:been )?registered\b/.test(text) ||
    /\balready exists\b/.test(text) ||
    /\balready in use\b/.test(text) ||
    /\buser_already_exists\b/.test(text) ||
    /\bemail_exists\b/.test(text) ||
    /\bemail_taken\b/.test(text)
  ) {
    return true;
  }
  if (/\bunique\b/.test(text) && /\bemail\b/.test(text)) return true;
  return false;
}

export function isMissingLegalAttestationsError(raw: unknown): boolean {
  const text = extractSignupErrorText(raw).toLowerCase();
  if (!text) return false;
  return (
    text.includes("legal_attestations") ||
    (text.includes("does not exist") && text.includes("legal"))
  );
}

export function humanizeSignupAccountError(raw: unknown): string {
  if (isAlreadyUsedEmailError(raw)) return SIGNUP_EMAIL_IN_USE_MESSAGE;
  if (isMissingLegalAttestationsError(raw)) return SIGNUP_AGREEMENT_SAVE_FAILED_MESSAGE;

  const text = extractSignupErrorText(raw);
  const lower = text.toLowerCase();
  if (!text || EMPTY_TEXT.test(text)) return SIGNUP_ACCOUNT_GENERIC_MESSAGE;

  if (/missing supabase environment variable/i.test(text)) {
    return "Couldn't reach the account service. Please try again.";
  }
  if (/permission denied|row-level security|rls|42501|401|403/.test(lower)) {
    return "Couldn't create the account (access error). Please try again.";
  }
  if (/weak|pwned|easy to guess/.test(lower)) {
    return text.length <= 180 ? text : SIGNUP_ACCOUNT_GENERIC_MESSAGE;
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (
    cleaned.length >= 8 &&
    cleaned.length <= 180 &&
    !/[()]/.test(cleaned) &&
    !/constraint|violates|relation |syntax error/i.test(cleaned)
  ) {
    return cleaned;
  }
  return SIGNUP_ACCOUNT_GENERIC_MESSAGE;
}
