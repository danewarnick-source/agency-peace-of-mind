// Shared document extraction engine backed by AWS Bedrock.
// Used by both the Nectar document store (ingestDocument) and Smart Import.
// Never checks LOVABLE_API_KEY — Bedrock credentials come from AWS_* env vars.

import { gatewayFetch } from "@/lib/ai-bedrock.server";
import { z } from "zod";

// ---- Output schema ----

export const BillingCodeOut = z.object({
  service_code: z.string().min(1),
  rate: z.number().optional().nullable(),
  max_units: z.number().optional().nullable(),
  unit_type: z.string().optional().nullable(),
  plan_start: z.string().optional().nullable(),
  plan_end: z.string().optional().nullable(),
});
export type BillingCode = z.infer<typeof BillingCodeOut>;

export const GoalOut = z.object({
  text: z.string().min(1),
  goal_number: z.string().optional().nullable(),
});
export type Goal = z.infer<typeof GoalOut>;

export const FieldOut = z.object({
  field_key: z.string().min(1).max(80),
  field_group: z.string().max(80).optional().nullable(),
  value_text: z.string().max(2000).optional().nullable(),
  value_number: z.number().optional().nullable(),
  value_date: z.string().max(40).optional().nullable(),
  value_json: z.unknown().optional().nullable(),
  source_locator: z.string().max(200).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
});
export type Field = z.infer<typeof FieldOut>;

export const ExtractionOut = z.object({
  document_type: z.string().max(40).optional().nullable(),
  fiscal_year: z.string().max(20).optional().nullable(),
  effective_start: z.string().max(40).optional().nullable(),
  effective_end: z.string().max(40).optional().nullable(),
  medicaid_id: z.string().max(50).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  display_name: z.string().max(200).optional().nullable(),
  billing_codes: z.array(BillingCodeOut).default([]),
  goals: z.array(GoalOut).default([]),
  fields: z.array(FieldOut).max(200).default([]),
  unfiled: z.array(z.string()).default([]),
});
export type ExtractionResult = z.infer<typeof ExtractionOut>;

const EMPTY_RESULT: ExtractionResult = {
  document_type: null,
  fiscal_year: null,
  effective_start: null,
  effective_end: null,
  medicaid_id: null,
  title: null,
  display_name: null,
  billing_codes: [],
  goals: [],
  fields: [],
  unfiled: [],
};

// ---- Prompt ----

const SYSTEM_PROMPT = `You are NECTAR, an extraction engine for a Utah DSPD provider compliance platform (HIVE).
You receive raw text from a document (PCSP, 1056 budget, SOW, referral, intake, assessment, certification, contract, etc.).

Return ONLY a single valid JSON object — no prose, no code fences, no commentary.

Required top-level shape:
{
  "document_type": "pcsp"|"1056_budget"|"sow"|"referral"|"intake"|"assessment"|"certification"|"training"|"contract"|"evv_report"|"timesheet"|"incident_report"|"billing_record"|"other",
  "fiscal_year": "FY26",
  "effective_start": "yyyy-mm-dd",
  "effective_end": "yyyy-mm-dd",
  "medicaid_id": "digits only",
  "title": "short doc title",
  "display_name": "First Last (the client or employee this document is about)",
  "billing_codes": [
    {
      "service_code": "HHS",
      "rate": 125.00,
      "max_units": 365,
      "unit_type": "day",
      "plan_start": "2026-07-01",
      "plan_end": "2027-06-30"
    }
  ],
  "goals": [
    { "text": "Full goal text...", "goal_number": "1" }
  ],
  "fields": [
    {
      "field_key": "first_name",
      "field_group": "person",
      "value_text": "Jane",
      "source_locator": "page 1",
      "confidence": 0.97
    }
  ],
  "unfiled": ["any sentence you could not place"]
}

billing_codes rules:
- One entry per authorization/service-code line — NEVER join into a string.
- Include rate (numeric, per-unit dollar amount), max_units (annual total), unit_type (e.g. "quarter_hour", "day", "month").

goals rules:
- One entry per PCSP goal — NEVER join goals into a single string.
- Capture goal_number if present (e.g. "1", "2a").

fields[] — use these field_key / field_group values when the data is present:
  Person        (group "person"):                first_name, last_name, date_of_birth, medicaid_id, phone, address
  Emergency     (group "emergency_contact"):     emergency_contact_name, emergency_contact_phone
  Guardian      (group "guardian"):              guardian_name, guardian_phone, guardian_relationship
  Coordinator   (group "support_coordinator"):   support_coordinator_name, support_coordinator_phone, support_coordinator_email
  Medical       (group "medical"):               allergies, dysphagia, diagnoses, medications
  Billing meta  (group "billing_code"):          financial_eligibility
  Certification (group "cert"):                  cert_name, issued_at, expires_at, issuing_body

For any field not listed above, invent a snake_case field_key; it will be stored as a custom attribute.

Rules:
- Dates as ISO yyyy-mm-dd whenever possible.
- confidence 0..1; omit or set null if you have no supporting text.
- Never invent data. If a field isn't in the document, omit it.
- Return ONLY the JSON object.`;

// ---- Main export ----

export async function extractDocumentFields(
  documentText: string,
  hint?: string,
): Promise<ExtractionResult> {
  const truncated = documentText.slice(0, 60_000);

  const res = await gatewayFetch({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${hint ? `HINT: ${hint}\n\n` : ""}DOCUMENT TEXT:\n\n${truncated}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 401)
      throw new Error(
        "AWS Bedrock credentials are not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / BEDROCK_MODEL_ID).",
      );
    throw new Error(`AI extraction failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const body = await res.json();
  const rawContent: string = body?.choices?.[0]?.message?.content ?? "";

  if (!rawContent) {
    console.error("[document-extraction] Bedrock returned empty content");
    throw new Error("AI returned an empty response. The document may be unreadable.");
  }

  let parsed: unknown;
  try {
    const clean = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(clean || "{}");
  } catch {
    console.error("[document-extraction] malformed JSON snippet:", rawContent.slice(0, 300));
    throw new Error("AI returned malformed JSON. The document may be unreadable.");
  }

  const result = ExtractionOut.safeParse(parsed);
  if (!result.success) {
    console.warn("[document-extraction] schema mismatch, partial result:", JSON.stringify(parsed).slice(0, 300));
    return EMPTY_RESULT;
  }
  return result.data;
}
