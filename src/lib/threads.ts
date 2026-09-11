/**
 * Soft + Ask staff threads (Compliance revamp Step 9).
 * Pure helpers. Persist lives in threads.functions.ts.
 * Zero PHI in push / chat / SMS / email copy.
 */

export const THREAD_KINDS = ["shift", "team", "client"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export const THREAD_MEMBER_ROLES = ["asker", "staff", "member"] as const;
export type ThreadMemberRole = (typeof THREAD_MEMBER_ROLES)[number];

export const THREAD_MESSAGE_KINDS = ["question", "answer", "message"] as const;
export type ThreadMessageKind = (typeof THREAD_MESSAGE_KINDS)[number];

export const ASK_STAFF_SUBJECT = "Question on a shift";
export const TEAM_DAY_SUPPORT_SUBJECT = "Day support";

export const ASK_NOTIFICATION_TITLE = "Question on a shift";
export const ASK_NOTIFICATION_BODY =
  "A manager asked a question about one of your shifts. Open Threads to reply.";
export const ASK_NOTIFICATION_TYPE = "timesheet_exception";

export function shiftAskSubject(): string {
  return ASK_STAFF_SUBJECT;
}

export function teamThreadSubject(subject?: string | null): string {
  const trimmed = (subject ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : TEAM_DAY_SUPPORT_SUBJECT;
}

/** Push / email / SMS copy — ids and operational wording only. */
export function phiSafeAskNotify(input: {
  channel: "notification" | "email" | "sms";
}): { title: string; body: string; subject?: string } {
  if (input.channel === "sms") {
    return {
      title: ASK_NOTIFICATION_TITLE,
      body: "HIVE: A manager asked about a shift. Open Threads in HIVE to reply. No client details in this text.",
    };
  }
  if (input.channel === "email") {
    return {
      title: ASK_NOTIFICATION_TITLE,
      subject: ASK_NOTIFICATION_TITLE,
      body: "A manager asked a question about a shift. Sign in to HIVE and open Threads to reply. This message does not include client or clinical details.",
    };
  }
  return {
    title: ASK_NOTIFICATION_TITLE,
    body: ASK_NOTIFICATION_BODY,
  };
}

export function advisoryMoveToClientThread(input: {
  kind: ThreadKind;
  hasClientId: boolean;
}): { advisory: true; canMove: false; message: string } {
  if (input.kind === "client") {
    return {
      advisory: true,
      canMove: false,
      message: "This thread is already on the client file. Nothing to move.",
    };
  }
  if (!input.hasClientId) {
    return {
      advisory: true,
      canMove: false,
      message:
        "Advisory only: a client thread would need a client on the shift. HIVE does not move this thread.",
    };
  }
  return {
    advisory: true,
    canMove: false,
    message:
      "Advisory only: this question may belong on the client thread. HIVE does not move or copy the thread.",
  };
}

export function missingThreadsTable(message: string): boolean {
  return (
    /\b(threads|thread_members|thread_messages)\b/i.test(message) &&
    /does not exist|schema cache|could not find|relation/i.test(message)
  );
}

export function isThreadKind(value: string | null | undefined): value is ThreadKind {
  return value === "shift" || value === "team" || value === "client";
}

export function sanitizeThreadBody(body: string): string {
  return body.trim().slice(0, 4000);
}
