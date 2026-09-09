/**
 * Invite / resend server-fn results are not always the documented shape.
 * useServerFn can resolve to undefined (empty body) or {status:500, unhandled:true}
 * without throwing — the hire-wizard toast then crashed on `res.sent`.
 *
 * Accept both payload families:
 *   - inviteStaffMembers: { sent, skipped, errors, results }
 *   - createInvitation / resendInvitation: { invitation, email_sent, email_error }
 */

export const INVITE_SEND_UNCONFIRMED =
  "Invite email could not be confirmed. Check Pending invitations or try Resend.";

export type InviteSendResultRow = {
  email?: string | null;
  user_id?: string | null;
  status?: string | null;
  reason?: string | null;
};

export type InterpretedInviteSend = {
  sent: number;
  skipped: number;
  errors: number;
  email_sent: boolean;
  email_error: string | null;
  email: string | null;
  results: InviteSendResultRow[];
  /** Hard RPC / missing-payload failure — toast as error, never read `.sent` raw. */
  rpc_failure: boolean;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function asResults(value: unknown): InviteSendResultRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is InviteSendResultRow => !!row && typeof row === "object");
}

function invitationEmail(value: unknown): string | null {
  const inv = asRecord(value);
  const email = inv?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

function firstReason(results: InviteSendResultRow[], fallback: string | null): string | null {
  for (const row of results) {
    if (typeof row.reason === "string" && row.reason.trim()) return row.reason.trim();
  }
  return fallback;
}

function isRpcFailure(row: Record<string, unknown>): boolean {
  if (row.unhandled === true) return true;
  if (row.status === 500) return true;
  const message = String(row.message ?? "");
  return /server function info not found/i.test(message);
}

export function interpretInviteSendResult(res: unknown): InterpretedInviteSend {
  const empty: InterpretedInviteSend = {
    sent: 0,
    skipped: 0,
    errors: 1,
    email_sent: false,
    email_error: INVITE_SEND_UNCONFIRMED,
    email: null,
    results: [],
    rpc_failure: true,
    message: INVITE_SEND_UNCONFIRMED,
  };

  const row = asRecord(res);
  if (!row) return empty;
  if (isRpcFailure(row)) {
    const message =
      typeof row.message === "string" && row.message.trim() && !/HTTPError/i.test(row.message)
        ? row.message.trim()
        : INVITE_SEND_UNCONFIRMED;
    return { ...empty, email_error: message, message };
  }

  const results = asResults(row.results);
  const invitationEmailValue = invitationEmail(row.invitation);
  const firstEmail =
    invitationEmailValue ??
    (typeof results[0]?.email === "string" && results[0].email.trim() ? results[0].email.trim() : null);

  const sentFromCount = typeof row.sent === "number" && Number.isFinite(row.sent) ? row.sent : null;
  const emailSentFlag = row.email_sent === true;
  const sent = sentFromCount ?? (emailSentFlag ? 1 : 0);
  const skipped = typeof row.skipped === "number" && Number.isFinite(row.skipped) ? row.skipped : 0;
  const errorsFromCount = typeof row.errors === "number" && Number.isFinite(row.errors) ? row.errors : null;

  const emailError =
    typeof row.email_error === "string" && row.email_error.trim()
      ? row.email_error.trim()
      : firstReason(results, null);

  const createdUnsent = results.some((r) => r.status === "created_unsent");
  const errors =
    errorsFromCount ??
    (emailSentFlag || sent > 0 ? 0 : createdUnsent || emailError ? 1 : 0);

  const email_sent = emailSentFlag || sent > 0;
  const hasInviteShape =
    sentFromCount !== null ||
    "email_sent" in row ||
    "invitation" in row ||
    results.length > 0 ||
    "skipped" in row ||
    "errors" in row;

  if (!hasInviteShape) return empty;

  let message: string;
  if (email_sent) {
    message = firstEmail ? `Invite emailed to ${firstEmail}.` : sent === 1 ? "Invite emailed." : `Invited ${sent} employees.`;
  } else if (createdUnsent || emailError) {
    message = `Invitation created, but the email couldn't be sent (${emailError ?? "unknown error"}). Share the join link from Pending invitations.`;
  } else {
    message = firstReason(results, null) ?? "Invite was not sent.";
  }

  return {
    sent,
    skipped,
    errors,
    email_sent,
    email_error: emailError,
    email: firstEmail,
    results,
    rpc_failure: false,
    message,
  };
}

export function resendInviteToastMessage(outcome: InterpretedInviteSend): {
  tone: "success" | "warning" | "error";
  text: string;
} {
  if (outcome.rpc_failure) {
    return { tone: "error", text: outcome.message };
  }
  if (outcome.email_sent) {
    const who = outcome.email ? ` to ${outcome.email}` : "";
    return { tone: "success", text: `Invitation re-emailed${who} — expires in 14 days` };
  }
  return {
    tone: "warning",
    text: `Invitation refreshed, but the email couldn't be sent (${outcome.email_error ?? "unknown error"}). Share the link manually instead.`,
  };
}
