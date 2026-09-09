/**
 * Turn supabase.functions.invoke("send-email") failures into an owner-safe
 * sentence. supabase-js otherwise surfaces only
 * "Edge Function returned a non-2xx status code", which hides 404 (function
 * not deployed), missing RESEND_API_KEY, and unverified Resend domains.
 *
 * Never echo recipient addresses or API keys.
 */

export type EmailInvokeError = {
  message?: string;
  context?: unknown;
};

export type EmailInvokeData = {
  error?: unknown;
  status?: unknown;
  message?: unknown;
  ok?: unknown;
} | null;

function stripEmails(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[address]").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readStatus(invokeErr: EmailInvokeError | null | undefined, invokeData: EmailInvokeData): number | undefined {
  const dataStatus = invokeData && typeof invokeData.status === "number" ? invokeData.status : undefined;
  if (dataStatus) return dataStatus;

  const ctx = invokeErr?.context;
  const rec = asRecord(ctx);
  if (rec && typeof rec.status === "number") return rec.status;
  return undefined;
}

function readDetail(invokeErr: EmailInvokeError | null | undefined, invokeData: EmailInvokeData): string | undefined {
  const fromData =
    (invokeData && typeof invokeData.error === "string" && invokeData.error) ||
    (invokeData && typeof invokeData.message === "string" && invokeData.message) ||
    undefined;
  if (fromData) return fromData;

  const rec = asRecord(invokeErr?.context);
  if (rec) {
    if (typeof rec.error === "string" && rec.error) return rec.error;
    if (typeof rec.message === "string" && rec.message) return rec.message;
    const body = asRecord(rec.body);
    if (body && typeof body.error === "string" && body.error) return body.error;
  }

  const msg = invokeErr?.message?.trim();
  return msg || undefined;
}

export function describeEmailInvokeFailure(
  invokeErr: EmailInvokeError | null | undefined,
  invokeData?: EmailInvokeData,
): string {
  const status = readStatus(invokeErr, invokeData ?? null);
  const detail = stripEmails(readDetail(invokeErr, invokeData ?? null) ?? "");

  if (status === 404 || /requested function was not found|function was not found/i.test(detail)) {
    return "Email sending isn't installed on this environment yet (send-email function missing).";
  }
  if (/RESEND_API_KEY not configured/i.test(detail)) {
    return "Email sending isn't configured (RESEND_API_KEY missing on send-email).";
  }
  if (/domain is not verified|not verified/i.test(detail) || /invalid `?from`?/i.test(detail)) {
    return "The From domain isn't verified in Resend. Verify providerinterface.com, or set RESEND_FROM to a verified mailbox.";
  }
  if (detail && !/non-2xx/i.test(detail)) return detail;
  if (status === 401 || status === 403) return "Email sending was rejected (not authorized to call send-email).";
  if (status) return `Email send failed (HTTP ${status}).`;
  return "Email send failed";
}
