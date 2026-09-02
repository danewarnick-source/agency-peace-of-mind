/**
 * Signup password helpers for Auth's leaked / "known to be weak or easy" check.
 *
 * GoTrue (Supabase Auth) rejects Have I Been Pwned hits with:
 *   "Password is known to be weak and easy to guess, please choose a different one."
 * That message only appears after signUp today. We run the same HIBP range check
 * before submit (type / blur) and surface that same copy under the field.
 *
 * Do not add length, symbol, or complexity rules here. The existing 8-character
 * / one-number hints stay in the signup UI.
 */

/** Exact GoTrue HIBP / pwned copy (supabase/auth internal/api/password.go). */
export const AUTH_PWNED_PASSWORD_MESSAGE =
  "Password is known to be weak and easy to guess, please choose a different one.";

export function isAuthPwnedPasswordMessage(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  if (!m) return false;
  if (m.includes("at least") || m.includes("character of each")) return false;
  return m.includes("known to be weak") && (m.includes("easy") || m.includes("leaked"));
}

export function weakPasswordCopyFromAuth(message: string | null | undefined): string {
  const raw = String(message ?? "").trim();
  return isAuthPwnedPasswordMessage(raw) ? raw : AUTH_PWNED_PASSWORD_MESSAGE;
}

/** SHA-1 hex uppercase — same hash HIBP / GoTrue use for k-anonymity. */
export async function sha1HexUpper(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function hibpSha1Prefix(sha1Hex: string): string {
  return String(sha1Hex ?? "").toUpperCase().slice(0, 5);
}

/**
 * True when the HIBP range body lists this SHA-1 (k-anonymity suffix match).
 * Range lines look like `SUFFIX:COUNT`. Padding rows with count 0 are ignored.
 */
export function hibpRangeIncludesSha1(rangeText: string, sha1Hex: string): boolean {
  const suffix = String(sha1Hex ?? "").toUpperCase().slice(5);
  if (!suffix) return false;
  for (const line of String(rangeText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    const hash = (colon >= 0 ? trimmed.slice(0, colon) : trimmed).trim().toUpperCase();
    const countRaw = colon >= 0 ? trimmed.slice(colon + 1).trim() : "";
    if (hash !== suffix) continue;
    const count = Number.parseInt(countRaw, 10);
    if (countRaw && !Number.isNaN(count) && count <= 0) continue;
    return true;
  }
  return false;
}
