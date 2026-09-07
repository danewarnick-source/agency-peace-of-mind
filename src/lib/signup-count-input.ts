/**
 * Signup staff / client count drafts.
 *
 * A controlled number that does Math.max(1, Number(v) || 1) on every
 * keystroke cannot be cleared: "12" → delete 2 → "1" is stuck. Keep a
 * digit string (or empty) while editing; commit a clamped integer on
 * blur / Continue. Bounds come from clampStaffCount / clampClientCount —
 * do not invent a new minimum.
 */

import { clampClientCount, clampStaffCount } from "./hive-pricing.ts";

export const SIGNUP_STAFF_COUNT_ERROR = "Enter how many staff you will start with (1 or more).";
export const SIGNUP_CLIENT_COUNT_ERROR = "Enter how many clients you will start with (0 or more).";

/** Digits only. Empty is allowed while editing. */
export function signupCountDraftFromInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export type SignupCountParse =
  | { ok: true; value: number }
  | { ok: false; error: string };

export function parseSignupStaffCount(raw: string): SignupCountParse {
  const digits = signupCountDraftFromInput(raw);
  if (digits === "") return { ok: false, error: SIGNUP_STAFF_COUNT_ERROR };
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: SIGNUP_STAFF_COUNT_ERROR };
  return { ok: true, value: clampStaffCount(n) };
}

export function parseSignupClientCount(raw: string): SignupCountParse {
  const digits = signupCountDraftFromInput(raw);
  if (digits === "") return { ok: false, error: SIGNUP_CLIENT_COUNT_ERROR };
  const n = Number(digits);
  if (!Number.isInteger(n) || n < 0) return { ok: false, error: SIGNUP_CLIENT_COUNT_ERROR };
  return { ok: true, value: clampClientCount(n) };
}
