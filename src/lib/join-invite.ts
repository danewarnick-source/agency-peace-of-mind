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
  const base = String(origin || "").replace(/\/+$/, "");
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

export function isValidJoinPassword(password: string): boolean {
  return password.length >= 8 && /\d/.test(password);
}

/**
 * New invitees set a password. Existing auth users must type the password they
 * already use — join must never call admin.updateUserById({ password }).
 */
export function joinSetsAuthPassword(accountExists: boolean): boolean {
  return !accountExists;
}

/** Existing accounts: any non-empty password is sent to Auth to verify. */
export function isValidExistingJoinPassword(password: string): boolean {
  return password.length > 0 && password.length <= 200;
}

export function isValidJoinUsername(username: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(username.trim());
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
