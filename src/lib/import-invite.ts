/**
 * Post–Smart Import invite bucketing. Pure — no I/O — so the done-page
 * summary and the bulk-invite skip rules stay in lockstep.
 *
 * ready: has email, login not finished (must_change_password), not accepted
 * missing_email: imported but not inviteable
 * already_login: signed in / accepted invite / already set their password
 */

export type ImportInviteBucket = "ready" | "missing_email" | "already_login";

export type ImportInviteInput = {
  email: string | null | undefined;
  mustChangePassword: boolean | null | undefined;
  invitationStatus: string | null | undefined;
};

export function hasUsableInviteEmail(email: string | null | undefined): boolean {
  return String(email ?? "").trim().includes("@");
}

export function classifyImportInvite(input: ImportInviteInput): ImportInviteBucket {
  if (!hasUsableInviteEmail(input.email)) return "missing_email";
  const status = String(input.invitationStatus ?? "").toLowerCase();
  if (status === "accepted") return "already_login";
  // Admin-created roster row that has not completed first login.
  if (input.mustChangePassword === true) return "ready";
  return "already_login";
}

/** Invite / resend is allowed. Never auto-reinvite an accepted join. */
export function canSendImportInvite(
  input: ImportInviteInput,
  opts?: { resendAccepted?: boolean; force?: boolean },
): boolean {
  if (!hasUsableInviteEmail(input.email)) return false;
  const status = String(input.invitationStatus ?? "").toLowerCase();
  if (status === "accepted") return opts?.resendAccepted === true;
  // Hire wizard "Send invite email" is an explicit admin action — send even
  // when must_change_password is unreadable over RLS.
  if (opts?.force) return true;
  return classifyImportInvite(input) === "ready";
}

export function summarizeImportInviteBuckets(
  rows: ImportInviteInput[],
): { ready: number; missing_email: number; already_login: number } {
  const out = { ready: 0, missing_email: 0, already_login: 0 };
  for (const row of rows) out[classifyImportInvite(row)] += 1;
  return out;
}
