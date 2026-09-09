/**
 * Shared username rules for owner signup and staff invite-join.
 *
 * Product lock: email addresses are valid usernames. Default everyone’s
 * username to their email so staff are not forced onto a separate handle.
 * Existing letter-led handles (3–32 letters / numbers / underscores) stay valid.
 */

import { isValidSignupEmail, normalizeSignupEmail } from "./signup-email.ts";

/** RFC 5321 practical max for an email / email-as-username. */
export const USERNAME_MAX_LENGTH = 254;
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 32;

export const USERNAME_HINT =
  "Defaults to your email. Keep that, or use 3–32 letters, numbers, or underscores.";

export const USERNAME_INVALID =
  "Use your email address, or 3–32 letters, numbers, or underscores starting with a letter.";

const HANDLE_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/;

export function normalizeUsername(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

/** Preferred default: the mailbox, lowercased. */
export function defaultUsernameFromEmail(email: string | null | undefined): string {
  return normalizeSignupEmail(email ?? "");
}

export function isValidEmailUsername(username: string): boolean {
  const t = normalizeUsername(username);
  if (!t || t.length > USERNAME_MAX_LENGTH) return false;
  return isValidSignupEmail(t);
}

export function isValidHandleUsername(username: string): boolean {
  const t = normalizeUsername(username);
  if (t.length < HANDLE_MIN_LENGTH || t.length > HANDLE_MAX_LENGTH) return false;
  return HANDLE_RE.test(t);
}

export function isValidUsername(username: string): boolean {
  return isValidEmailUsername(username) || isValidHandleUsername(username);
}

/**
 * Live copy. Empty / whitespace → null (helper text already explains the rule).
 * Emails are accepted; the old “must start with a letter” rule only applies to handles.
 */
export function usernameLiveMessage(username: string): { ok: boolean; text: string } | null {
  const t = normalizeUsername(username);
  if (!t) return null;
  if (t.includes("@")) {
    if (t.length > USERNAME_MAX_LENGTH) {
      return { ok: false, text: "Must be 254 characters or fewer." };
    }
    if (isValidEmailUsername(t)) {
      return { ok: true, text: "Email works as your username." };
    }
    return { ok: false, text: "That doesn't look like a complete email address." };
  }
  if (!/^[a-zA-Z]/.test(t)) {
    return { ok: false, text: "A handle must start with a letter — or keep your email as the username." };
  }
  if (t.length < HANDLE_MIN_LENGTH) {
    return { ok: false, text: "A handle must be at least 3 characters — or keep your email as the username." };
  }
  if (t.length > HANDLE_MAX_LENGTH) {
    return { ok: false, text: "A handle must be 32 characters or fewer — or keep your email as the username." };
  }
  if (!HANDLE_RE.test(t)) {
    return { ok: false, text: "Handles allow letters, numbers, and underscores — or keep your email as the username." };
  }
  return { ok: true, text: "Username looks good." };
}

/**
 * Prefer the typed value when it is valid; otherwise use the email.
 * Email usernames are stored lowercased so they match login.
 */
export function resolveAccountUsername(input: {
  username?: string | null;
  email: string;
}): string {
  const raw = normalizeUsername(input.username);
  if (isValidUsername(raw)) {
    return isValidEmailUsername(raw) ? raw.toLowerCase() : raw;
  }
  const fromEmail = defaultUsernameFromEmail(input.email);
  return isValidEmailUsername(fromEmail) ? fromEmail : raw;
}
