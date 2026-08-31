/**
 * Staff Ask NECTAR failure copy.
 *
 * Bedrock/gateway 400s were shown as "AI error (400)" with no reason.
 * Read the response body (ValidationException, length, credentials) and
 * say what failed in plain language. Never echo raw AWS ARNs or stack.
 */

function sanitizeGatewayDetail(raw: string): string {
  return (raw || "")
    .replace(/arn:aws:[^\s,]+/gi, "")
    .replace(/\bfor model \S+/gi, "")
    .replace(/\bin [a-z]{2}-[a-z]+-\d+\b/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function staffNectarFailureMessage(status: number, raw: string): string {
  const t = sanitizeGatewayDetail(raw);
  const clipped = t.length > 180 ? `${t.slice(0, 177)}…` : t;

  if (status === 429 || /Throttl/i.test(t)) {
    return "NECTAR is busy right now. Wait a moment and ask again.";
  }
  if (status === 402) {
    return "NECTAR credits are used up. Ask an admin to add AI credits.";
  }
  if (status === 401 || /AccessDenied|UnrecognizedClient|InvalidSignature|not configured/i.test(t)) {
    return "NECTAR is not configured on this deployment. An admin needs to set AWS Bedrock credentials.";
  }
  if (/on-demand throughput|inference profile/i.test(t)) {
    return "NECTAR's model id is wrong for this account. An admin needs to set an inference profile in BEDROCK_MODEL_ID.";
  }
  if (/too long|length exceeded|ValidationException|input is too long|character limit|token/i.test(t)) {
    return "NECTAR could not load that much caseload context. Ask about one person by name, or try again.";
  }
  if (status === 400) {
    return clipped
      ? `NECTAR could not answer that request: ${clipped}`
      : "NECTAR rejected that request. Try a shorter question, or ask about one person by name.";
  }
  if (status >= 500) {
    return "NECTAR is temporarily unavailable. Try again in a moment.";
  }
  return clipped
    ? `NECTAR could not answer (${status}): ${clipped}`
    : `NECTAR could not answer (status ${status}).`;
}

export function slimPcspGoals(goals: string[] | null | undefined): string[] {
  return (goals ?? []).slice(0, 12).map((g) => g.slice(0, 240));
}

export function questionWantsMedications(question: string): boolean {
  return /\b(med(?:ication)?s?|dose|dosage|prn|missed dose)\b/i.test(question);
}

export function questionWantsClientContext(question: string): boolean {
  return /\b(client|pcsp|goal|medication|meds|directions|caseload)\b/i.test(question);
}
