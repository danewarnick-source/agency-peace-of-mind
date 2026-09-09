import { resolveAuthOrigin } from "./auth-redirect.ts";
import { defaultUsernameFromEmail } from "./account-username.ts";

/** Shown on every failed join so testers are not dumped into new-agency signup. */
export const ASK_ADMIN_MANUAL = "Ask your admin to add you manually.";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function extractInviteToken(search: { invite?: unknown; token?: unknown }): string | null {
  const raw = search.invite ?? search.token;
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

/** Parse `location.searchStr` (`?invite=` or `?token=`) the way /signup redirect does. */
export function inviteTokenFromSearchStr(searchStr: string | null | undefined): string | null {
  const raw = String(searchStr || "").replace(/^\?/, "");
  const sp = new URLSearchParams(raw);
  return extractInviteToken({ invite: sp.get("invite"), token: sp.get("token") });
}

export function inviteJoinUrl(origin: string, token: string): string {
  const base = resolveAuthOrigin(origin);
  return `${base}/join?invite=${encodeURIComponent(token)}`;
}

export type InviteFailureReason =
  | "missing"
  | "not_found"
  | "expired"
  | "used"
  | "revoked"
  | "email_mismatch"
  | "not_authenticated"
  | "invalid_role"
  | "unknown";

export function inviteFailureMessage(reason: InviteFailureReason): string {
  switch (reason) {
    case "missing":
      return `This invitation link is missing its code. ${ASK_ADMIN_MANUAL}`;
    case "not_found":
      return `This invitation link isn't valid. ${ASK_ADMIN_MANUAL}`;
    case "expired":
      return `This invitation has expired. ${ASK_ADMIN_MANUAL}`;
    case "used":
      return `This invitation was already used. ${ASK_ADMIN_MANUAL}`;
    case "revoked":
      return `This invitation was cancelled. ${ASK_ADMIN_MANUAL}`;
    case "email_mismatch":
      return `This invitation was sent to a different email than the one you're using. ${ASK_ADMIN_MANUAL}`;
    case "not_authenticated":
      return `We couldn't sign you in with that password. Try again, or ${ASK_ADMIN_MANUAL.toLowerCase()}`;
    case "invalid_role":
      return `This invitation can't be used for that role. ${ASK_ADMIN_MANUAL}`;
    default:
      return `We couldn't complete this invitation. ${ASK_ADMIN_MANUAL}`;
  }
}

/** Map Postgres / RPC errors to a human sentence. Never echo UUIDs or raw SQL. */
export function humanizeInviteError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  const lower = text.toLowerCase();

  if (!text.trim()) return inviteFailureMessage("unknown");
  if (lower.includes("not authenticated")) return inviteFailureMessage("not_authenticated");
  if (lower.includes("not found") || lower.includes("isn't valid")) {
    return inviteFailureMessage("not_found");
  }
  if (lower.includes("expired")) return inviteFailureMessage("expired");
  if (lower.includes("already used") || lower.includes("already accepted")) {
    return inviteFailureMessage("used");
  }
  if (lower.includes("revoked") || lower.includes("cancelled") || lower.includes("canceled")) {
    return inviteFailureMessage("revoked");
  }
  if (lower.includes("email does not match") || lower.includes("different email")) {
    return inviteFailureMessage("email_mismatch");
  }
  if (lower.includes("invalid invitation role")) return inviteFailureMessage("invalid_role");
  if (lower.includes("username") && (lower.includes("taken") || lower.includes("already"))) {
    return "That username is already taken. Choose a different one.";
  }

  const stripped = text.replace(UUID_RE, "").replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length < 8) return inviteFailureMessage("unknown");
  if (/constraint|violates|relation |syntax error|permission denied/i.test(stripped)) {
    return inviteFailureMessage("unknown");
  }
  // Keep a short, UUID-free sentence if the server already sent one.
  if (stripped.length <= 180 && !/[()]/.test(stripped)) return stripped;
  return inviteFailureMessage("unknown");
}

export function joinHomeForRole(role: string | null | undefined): string {
  if (role === "admin" || role === "manager" || role === "program_manager") {
    return "/dashboard";
  }
  if (role === "committee_member") return "/dashboard/hrc";
  return "/employee";
}

/** Staff join: length only. GoTrue default is 6 with no required character classes. */
export const JOIN_PASSWORD_MIN_LENGTH = 8;
export const JOIN_PASSWORD_MAX_LENGTH = 200;

export const JOIN_PASSWORD_HINT =
  "At least 8 characters. Letters and numbers are fine — no special character required.";

export {
  USERNAME_HINT as JOIN_USERNAME_HINT,
  USERNAME_INVALID as JOIN_USERNAME_INVALID,
  USERNAME_MAX_LENGTH as JOIN_USERNAME_MAX_LENGTH,
  defaultUsernameFromEmail,
  isValidUsername as isValidJoinUsername,
  resolveAccountUsername,
  usernameLiveMessage as joinUsernameLiveMessage,
} from "./account-username.ts";

export const JOIN_PASSWORD_TOO_SHORT = "Password must be at least 8 characters.";

/**
 * New-invite password rule: 8–200 characters. No digit / symbol / case classes.
 * Matches reset-password and is slightly above GoTrue's default min (6).
 * Auth may still reject a leaked / HIBP-listed password if that project flag is on.
 */
export function isValidJoinPassword(password: string): boolean {
  return (
    password.length >= JOIN_PASSWORD_MIN_LENGTH && password.length <= JOIN_PASSWORD_MAX_LENGTH
  );
}

/** Live copy for a new password. Empty string means "not typed yet". */
export function joinPasswordLiveMessage(password: string): { ok: boolean; text: string } | null {
  if (!password) return null;
  if (password.length < JOIN_PASSWORD_MIN_LENGTH) {
    return { ok: false, text: `Too short — need at least ${JOIN_PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > JOIN_PASSWORD_MAX_LENGTH) {
    return { ok: false, text: "Password is too long." };
  }
  return { ok: true, text: "Password looks good." };
}

export function joinConfirmLiveMessage(
  password: string,
  confirm: string,
): { ok: boolean; text: string } | null {
  if (!confirm) return null;
  if (password !== confirm) return { ok: false, text: "Passwords don't match." };
  if (!password) return { ok: false, text: "Passwords don't match." };
  return { ok: true, text: "Passwords match." };
}

/**
 * New invitees set a password. Existing logins that already chose a password
 * must type that password — join must not overwrite it.
 *
 * Exception: admin-created roster rows with must_change_password still need
 * the join/set-password step (Add employee → Send invite).
 */
export function joinSetsAuthPassword(
  accountExists: boolean,
  opts?: { mustChangePassword?: boolean },
): boolean {
  if (opts?.mustChangePassword) return true;
  return !accountExists;
}

/** Existing accounts: any non-empty password is sent to Auth to verify. */
export function isValidExistingJoinPassword(password: string): boolean {
  return password.length > 0 && password.length <= 200;
}

/** Prefill / restore: username is the invite email (not a sanitized local-part). */
export function suggestJoinUsername(email: string): string {
  return defaultUsernameFromEmail(email);
}

/** True when this page is new-agency signup (payment / team size), not join. */
export function isNewAgencySignupCopy(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("team & pricing") ||
    t.includes("billed today") ||
    (t.includes("staff") && t.includes("pricing")) ||
    t.includes("start running your dspd agency")
  );
}
