/**
 * Signup workspace / session copy.
 *
 * Live Auth with confirm-email returns signUp 200 + session null
 * (user_confirmation_requested). The Account step used to advance anyway.
 * Continue then called getUser() with no uid — same toast as an empty org
 * select. Split those so the real cause is visible. No PHI in messages.
 */

export const SIGNUP_CONFIRM_EMAIL_MESSAGE =
  "Confirm the email we sent, then return here to finish setup.";

export const SIGNUP_CONFIRM_CONTINUE_LABEL = "I've confirmed — continue";

export const SIGNUP_ORG_ACCESS_ERROR_MESSAGE =
  "Couldn't read your workspace (access error). Please try again.";

export const SIGNUP_TRIGGER_BLOCKED_MESSAGE =
  "Workspace create is blocked on a leftover database trigger. Apply the signup SQL handoff, then continue.";

export const SIGNUP_PROVISION_FAILED_MESSAGE =
  "We couldn't create your workspace. Please try again.";

export type SignupWorkspaceReason =
  | "no_session"
  | "org_query_error"
  | "trigger_blocked"
  | "provision_failed";

export function signupHasSession(
  session: { access_token?: string | null; user?: { id?: string | null } | null } | null | undefined,
): boolean {
  return Boolean(session?.access_token && session.user?.id);
}

export function isSignupEmailNotConfirmedError(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return /email not confirmed/i.test(String(error ?? ""));
  }
  const row = error as { code?: unknown; message?: unknown };
  const code = String(row.code ?? "");
  const message = String(row.message ?? "");
  return code === "email_not_confirmed" || /email not confirmed/i.test(message);
}

export function messageForSignupWorkspaceReason(reason: SignupWorkspaceReason | null | undefined): string {
  switch (reason) {
    case "no_session":
      return SIGNUP_CONFIRM_EMAIL_MESSAGE;
    case "org_query_error":
      return SIGNUP_ORG_ACCESS_ERROR_MESSAGE;
    case "trigger_blocked":
      return SIGNUP_TRIGGER_BLOCKED_MESSAGE;
    case "provision_failed":
      return SIGNUP_PROVISION_FAILED_MESSAGE;
    default:
      return SIGNUP_PROVISION_FAILED_MESSAGE;
  }
}

export function isRbacSeedTriggerError(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("rbac_roles") || (m.includes("trg_seed_rbac") && m.includes("does not exist"));
}

export function workspaceNameFromSignup(opts: {
  agencyName?: string | null;
  emailLocalPart?: string | null;
}): string {
  const agency = String(opts.agencyName ?? "").trim();
  if (agency) return agency;
  const local = String(opts.emailLocalPart ?? "").trim();
  return local ? `${local}'s workspace` : "New workspace";
}
