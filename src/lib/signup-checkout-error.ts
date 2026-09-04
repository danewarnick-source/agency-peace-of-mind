/**
 * Payment / Checkout start errors. Never toast "{}" or invent SERVICE_ROLE.
 */

import { extractSignupErrorText } from "./signup-account-error.ts";

export const SIGNUP_CHECKOUT_START_MESSAGE =
  "Couldn't start checkout. Stay on this page and try again.";

export const SIGNUP_EMAIL_CONFIRM_DENIED_MESSAGE =
  "Email confirmation didn't finish. Open the latest link on this same tab, then continue.";

export const SIGNUP_CHECKOUT_CONFIRM_MESSAGE =
  "Payment went through. This host could not save the paid subscription row. Stay on this page.";

export const PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE =
  "Payment went through. This host is missing SUPABASE_SERVICE_ROLE_KEY, so the paid subscription row cannot be saved. Add SUPABASE_SERVICE_ROLE_KEY on this Vercel Preview and stay on this page.";

const EMPTY_TEXT = /^(?:\{\}|\[object Object\]|undefined|null|)$/i;

export function humanizeCheckoutStartError(raw: unknown): string {
  const text = extractSignupErrorText(raw);
  const lower = text.toLowerCase();
  if (!text || EMPTY_TEXT.test(text)) return SIGNUP_CHECKOUT_START_MESSAGE;
  if (/missing supabase environment variable/i.test(text)) return SIGNUP_CHECKOUT_START_MESSAGE;
  if (/service_role/i.test(text)) return SIGNUP_CHECKOUT_START_MESSAGE;
  if (/not signed in|session lost/i.test(text)) return "Session lost — please sign in again.";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (
    cleaned.length >= 8 &&
    cleaned.length <= 180 &&
    !/[()]/.test(cleaned) &&
    !/constraint|violates|relation |syntax error/i.test(cleaned)
  ) {
    return cleaned;
  }
  void lower;
  return SIGNUP_CHECKOUT_START_MESSAGE;
}

export function humanizeCheckoutConfirmError(raw: unknown): string {
  const text = extractSignupErrorText(raw);
  if (/SUPABASE_SERVICE_ROLE_KEY/i.test(text)) {
    return /missing SUPABASE_SERVICE_ROLE_KEY/i.test(text)
      ? text.replace(/\s+/g, " ").trim()
      : PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE;
  }
  if (!text || EMPTY_TEXT.test(text)) return SIGNUP_CHECKOUT_CONFIRM_MESSAGE;
  if (/missing supabase environment variable/i.test(text)) return PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE;
  if (/row-level security|42501/i.test(text)) return SIGNUP_CHECKOUT_CONFIRM_MESSAGE;
  return humanizeCheckoutStartError(raw);
}

/** Supabase confirm links can land with #error=access_denied / otp_expired. */
export function signupAuthCallbackError(search: string, hash: string): string | null {
  const src = `${search} ${hash}`.toLowerCase();
  if (
    src.includes("access_denied") ||
    src.includes("otp_expired") ||
    src.includes("error_code=otp") ||
    /error=.*otp/.test(src)
  ) {
    return SIGNUP_EMAIL_CONFIRM_DENIED_MESSAGE;
  }
  return null;
}
