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

function considerAdminUserEmail(out: string[], value: unknown): void {
  if (!value || typeof value !== "object") return;
  const email = (value as { email?: unknown }).email;
  if (typeof email === "string" && email.trim()) out.push(email);
}

/**
 * True only when a GoTrue admin users payload contains this exact mailbox.
 * Used after a profiles miss (Auth user can exist without a profiles row).
 * Never logs the email.
 */
export function authAdminUsersHasExactEmail(body: unknown, email: string): boolean {
  const want = normalizeSignupEmail(email);
  if (!want) return false;
  const found: string[] = [];
  if (Array.isArray(body)) {
    for (const row of body) considerAdminUserEmail(found, row);
  } else if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (Array.isArray(rec.users)) {
      for (const row of rec.users) considerAdminUserEmail(found, row);
    }
    considerAdminUserEmail(found, rec.user);
    considerAdminUserEmail(found, rec);
  }
  return found.some((candidate) => normalizeSignupEmail(candidate) === want);
}

/**
 * Escape `%`, `_`, and `\` so Postgres ILIKE is an exact match.
 * Plus (`+`) is not a wildcard and is left alone.
 */
export function escapeIlikeExact(value: string): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
