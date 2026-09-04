/**
 * Remember me is a login-form convenience only.
 * We persist the email/username so the next /login visit can prefill it.
 * Password stays with the browser password manager (autocomplete=current-password).
 * This is not a session and must never skip Sign in.
 */

export const REMEMBERED_LOGIN_EMAIL_KEY = "hive.remembered-login-email";

const MAX_IDENTIFIER = 120;

export function normalizeRememberedLoginIdentifier(raw: string | null | undefined): string {
  return String(raw ?? "").trim().slice(0, MAX_IDENTIFIER);
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserLocal(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRememberedLoginEmail(storage?: StorageLike | null): string {
  const s = storage !== undefined ? storage : browserLocal();
  if (!s) return "";
  try {
    return normalizeRememberedLoginIdentifier(s.getItem(REMEMBERED_LOGIN_EMAIL_KEY));
  } catch {
    return "";
  }
}

export function persistRememberedLoginEmail(identifier: string, storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : browserLocal();
  if (!s) return;
  const value = normalizeRememberedLoginIdentifier(identifier);
  try {
    if (value) s.setItem(REMEMBERED_LOGIN_EMAIL_KEY, value);
    else s.removeItem(REMEMBERED_LOGIN_EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

export function clearRememberedLoginEmail(storage?: StorageLike | null): void {
  persistRememberedLoginEmail("", storage);
}

/** After a successful password sign-in: keep or forget the prefill. Never stores a password. */
export function applyRememberMeOnSuccess(
  rememberMe: boolean,
  identifier: string,
  storage?: StorageLike | null,
): void {
  if (rememberMe) persistRememberedLoginEmail(identifier, storage);
  else clearRememberedLoginEmail(storage);
}
