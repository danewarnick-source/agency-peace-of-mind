/**
 * Signup / unique-email helpers.
 *
 * Uniqueness is exact after trim + lowercase. Do not strip Gmail +tags.
 * Do not Gmail-dot-normalize the local part.
 * danewarnick@gmail.com and danewarnick+pi1@gmail.com are distinct users.
 */

export function normalizeSignupEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidSignupEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeSignupEmail(email));
}

/** True only when the two addresses are the same exact mailbox (case-insensitive). */
export function signupEmailsAreSame(a: string, b: string): boolean {
  return normalizeSignupEmail(a) === normalizeSignupEmail(b);
}

/**
 * Escape `%`, `_`, and `\` so Postgres ILIKE is an exact match.
 * Plus (`+`) is not a wildcard and is left alone.
 */
export function escapeIlikeExact(value: string): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
