import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

/**
 * Server function: parse a client's 1056 budget or PCSP form using NECTAR
 * (Lovable AI / Gemini) and return the Plan Budget table rows so the UI can
 * preview them and write them to client_billing_codes.
 *
 * Caller provides the storage path inside the `client-documents` bucket; we
 * download it server-side (so the file never has to be re-fetched in the
 * browser), base64-encode it, and ask the model to extract the budget table.
 */

const InputSchema = z.object({
  storagePath: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(128).default("application/pdf"),
});

export interface ParsedBudgetRow {
  service_code: string;
  rate_per_unit: number | null;
  max_units: number | null;
  units_billed: number | null;
  start_date: string | null; // ISO YYYY-MM-DD
  end_date: string | null;
  financial_eligibility: string | null;
}

export interface ParsedBudget {
  plan_number: string | null;
  source_form: "PCSP" | "1056" | "Unknown";
  rows: ParsedBudgetRow[];
}

export const parseClientBudgetDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ParsedBudget> => {
    const { supabase } = context;

    // Download the document via the user's own session (RLS applies).
    const { data: blob, error: dlError } = await supabase.storage
      .from("client-documents")
      .download(data.storagePath);
    if (dlError || !blob) {
      throw new Error(`Could not read uploaded document: ${dlError?.message ?? "missing file"}`);
    }

    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.byteLength > 10 * 1024 * 1024) {
      throw new Error("Document is too large to parse (>10 MB). Please upload a smaller file.");
    }
    const base64 = buf.toString("base64");
    const dataUrl = `data:${data.mimeType};base64,${base64}`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway is not configured.");

    const system = `You extract the "Plan Budget" table from Utah DSPD 1056 budget forms and PCSP (Person-Centered Support Plan) forms.
Return strict JSON matching this TypeScript type:
{
  "plan_number": string | null,           // e.g. "619848" — look for a Plan # / Plan Number
  "source_form": "PCSP" | "1056" | "Unknown",
  "rows": Array<{
    "service_code": string,               // e.g. "DSI", "SEI", "DSL", "HHS"
    "rate_per_unit": number | null,       // dollars per unit (e.g. 4.25)
    "max_units": number | null,           // annual authorized units
    "units_billed": number | null,        // units already billed/used
    "start_date": string | null,          // ISO YYYY-MM-DD
    "end_date": string | null,            // ISO YYYY-MM-DD
    "financial_eligibility": string | null
  }>
}
Rules:
- service_code must be the short DSPD code (DSI, SEI, DSL, HHS, RES, etc.), never a long description.
- Numbers must be plain numbers (no $ or commas).
- Dates must be ISO YYYY-MM-DD or null if illegible.
- If a column is not present in the document, return null for that field.
- Return ONLY JSON, no commentary.`;

    const res = await gatewayFetch({
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the Plan Budget table from this form." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

    if (res.status === 429) throw new Error("NECTAR is busy right now — please try again in a moment.");
    if (res.status === 402) throw new Error("AI workspace credits exhausted. Add credits to continue.");
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`AI error (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Could not parse the document. Try a clearer scan or enter values manually.");
    }

    const OutputSchema = z.object({
      plan_number: z.string().nullable().optional(),
      source_form: z.enum(["PCSP", "1056", "Unknown"]).nullable().optional(),
      rows: z
        .array(
          z.object({
            service_code: z.string(),
            rate_per_unit: z.number().nullable().optional(),
            max_units: z.number().nullable().optional(),
            units_billed: z.number().nullable().optional(),
            start_date: z.string().nullable().optional(),
            end_date: z.string().nullable().optional(),
            financial_eligibility: z.string().nullable().optional(),
          }),
        )
        .default([]),
    });

    const safe = OutputSchema.parse(parsed);
    return {
      plan_number: safe.plan_number ?? null,
      source_form: safe.source_form ?? "Unknown",
      rows: safe.rows.map((r) => ({
        service_code: r.service_code.toUpperCase(),
        rate_per_unit: r.rate_per_unit ?? null,
        max_units: r.max_units ?? null,
        units_billed: r.units_billed ?? null,
        start_date: r.start_date ?? null,
        end_date: r.end_date ?? null,
        financial_eligibility: r.financial_eligibility ?? null,
      })),
    };
  });
