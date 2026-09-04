/**
 * User-initiated sign-out. A leftover Supabase/Cognito token plus
 * hive.activeOrgId was bouncing Dane from /login back into the last org
 * (often a locked test agency) without showing the form.
 *
 * Remember-me email is intentionally NOT cleared here — that is a login
 * form convenience, not a session.
 */

import { ACTIVE_ORG_STORAGE_KEY } from "./current-org.ts";
import { SESSION_HINT_KEY } from "./auth-session-boot.ts";
import { COGNITO_SESSION_KEY } from "./aws/session-store.ts";
import { PORTAL_VIEW_CHANGE_EVENT, PORTAL_VIEW_KEY } from "./portal-view-landing.ts";

export const SIGN_OUT_SENTINEL_KEY = "hive.explicit-sign-out";

export const AUTH_AND_ORG_PREF_KEYS = [
  ACTIVE_ORG_STORAGE_KEY,
  PORTAL_VIEW_KEY,
  "portal-view-state-code",
  "portal-view-state-sub",
  SESSION_HINT_KEY,
  COGNITO_SESSION_KEY,
] as const;

type StorageLike = {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isSupabaseAuthStorageKey(key: string): boolean {
  return /^(sb-[a-z0-9-]+-auth-token|supabase\.auth\.token)/i.test(key);
}

export function shouldClearClientKeyOnSignOut(key: string): boolean {
  if (AUTH_AND_ORG_PREF_KEYS.includes(key as (typeof AUTH_AND_ORG_PREF_KEYS)[number])) return true;
  return isSupabaseAuthStorageKey(key);
}

function removeMatchingKeys(storage: StorageLike | null | undefined, pred: (key: string) => boolean): void {
  if (!storage) return;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && pred(key)) keys.push(key);
  }
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore quota / private mode */
    }
  }
}

function browserLocal(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserSession(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Wipe auth tokens + last-org / portal routing prefs. Does not touch remembered email. */
export function clearAuthAndOrgClientState(opts?: {
  local?: StorageLike | null;
  session?: StorageLike | null;
}): void {
  const local = opts?.local !== undefined ? opts.local : browserLocal();
  const session = opts?.session !== undefined ? opts.session : browserSession();
  removeMatchingKeys(local, shouldClearClientKeyOnSignOut);
  removeMatchingKeys(session, shouldClearClientKeyOnSignOut);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(PORTAL_VIEW_CHANGE_EVENT));
    } catch {
      /* ignore */
    }
  }
}

export function hasExplicitSignOut(storage?: StorageLike | null): boolean {
  const s = storage !== undefined ? storage : browserLocal();
  if (!s) return false;
  try {
    return s.getItem(SIGN_OUT_SENTINEL_KEY) === "1";
  } catch {
    return false;
  }
}

export function markExplicitSignOut(storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : browserLocal();
  if (!s) return;
  try {
    s.setItem(SIGN_OUT_SENTINEL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearExplicitSignOut(storage?: StorageLike | null): void {
  const s = storage !== undefined ? storage : browserLocal();
  if (!s) return;
  try {
    s.removeItem(SIGN_OUT_SENTINEL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Sign out of GoTrue/Cognito, then wipe leftover tokens and last-org prefs.
 * Sets the explicit-sign-out sentinel so /login will not auto-enter a
 * half-cleared session. Pass markSignedOut: false for account-switch mid-flow
 * (join invite) where the next step is an immediate sign-in.
 */
export async function completeClientSignOut(
  signOut: () => Promise<unknown>,
  opts?: { markSignedOut?: boolean; local?: StorageLike | null; session?: StorageLike | null },
): Promise<void> {
  try {
    await signOut();
  } catch {
    /* still wipe local leftovers */
  }
  clearAuthAndOrgClientState({ local: opts?.local, session: opts?.session });
  if (opts?.markSignedOut === false) return;
  markExplicitSignOut(opts?.local);
}
