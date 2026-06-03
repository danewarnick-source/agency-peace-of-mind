import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";

// ---------- Schemas ----------

const ExtractInput = z.object({
  pdfBase64: z.string().min(100),
});

const ExtractedSchema = z.object({
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  medicaid_id: z.string().default(""),
  date_of_birth: z.string().default(""),
  authorized_codes: z.array(z.string()).default([]),
  pcsp_goals: z.array(z.string()).default([]),
  prompting_levels: z.array(z.string()).default([]),
});
export type ExtractedClient = z.infer<typeof ExtractedSchema>;

const CommitInput = z.object({
  organizationId: z.string().uuid(),
  client: z.object({
    id: z.string().uuid().nullable().optional(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    medicaid_id: z.string().max(50).default(""),
    pcsp_goals: z.array(z.string().min(1).max(500)).max(100).default([]),
    authorized_codes: z.array(z.string().min(2).max(8)).max(50).default([]),
  }),
});

// ---------- PDF text extraction (Worker-safe via unpdf) ----------

async function extractPdfText(base64: string): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // unpdf ships a serverless-friendly build of pdf.js
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// ---------- AI extraction via Lovable AI Gateway ----------

const KNOWN_CODES = EVV_SERVICE_CODES.map((c) => c.code).join(", ");

const SYSTEM_PROMPT = `You are an extraction engine for Utah DHHS / DSPD Person-Centered Support Plans (PCSPs) and client profile documents. You receive raw PDF text and must return ONLY the structured fields requested via the function call. Never invent values — leave a field blank if it is not present in the document. Service-authorization codes MUST be drawn from this allow-list: ${KNOWN_CODES}.`;

const USER_INSTRUCTIONS = `Extract the following from the document text:
- Client first_name and last_name (the individual receiving services, not parents/guardians/staff).
- medicaid_id (Utah Medicaid Member ID — typically 10 digits; strip dashes/spaces).
- date_of_birth in ISO format YYYY-MM-DD when present.
- authorized_codes: every DSPD service code that appears as ACTIVE / AUTHORIZED / APPROVED in this plan. Only return codes from the allow-list.
- pcsp_goals: each distinct goal, objective, or action-plan item written for the individual. Pull them verbatim (1 line each, trimmed to ~300 chars). Look under headings like "Action Plan", "Service Objectives", "Goals", "Outcomes", "Desired Outcomes". Skip section headers and boilerplate.
- prompting_levels: any prompting hierarchy mentioned (e.g. "Verbal", "Gestural", "Physical", "Independent", "Model").

Return at most 25 goals. Return at most 20 codes.`;

export const extractClientFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data }): Promise<ExtractedClient> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const pdfText = await extractPdfText(data.pdfBase64);
    if (!pdfText.trim()) {
      throw new Error("Could not read any text from this PDF (it may be a scanned image).");
    }

    // Cap the input to keep latency + cost bounded.
    const truncated = pdfText.slice(0, 60_000);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${USER_INSTRUCTIONS}\n\n--- DOCUMENT TEXT START ---\n${truncated}\n--- DOCUMENT TEXT END ---`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_client_profile",
              description: "Return the structured client profile extracted from the PCSP.",
              parameters: {
                type: "object",
                properties: {
                  first_name: { type: "string" },
                  last_name: { type: "string" },
                  medicaid_id: { type: "string" },
                  date_of_birth: { type: "string" },
                  authorized_codes: { type: "array", items: { type: "string" } },
                  pcsp_goals: { type: "array", items: { type: "string" } },
                  prompting_levels: { type: "array", items: { type: "string" } },
                },
                required: [
                  "first_name",
                  "last_name",
                  "medicaid_id",
                  "authorized_codes",
                  "pcsp_goals",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_client_profile" } },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Lovable AI.");
      throw new Error(`AI gateway error: ${res.status} ${t.slice(0, 200)}`);
    }

    const j = await res.json();
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : null;
    if (!args) throw new Error("AI returned no structured data");

    const parsed = ExtractedSchema.parse(args);

    // Sanitize codes against allow-list, uppercase, dedupe
    const allow = new Set(EVV_SERVICE_CODES.map((c) => c.code));
    parsed.authorized_codes = Array.from(
      new Set(parsed.authorized_codes.map((c) => c.trim().toUpperCase()).filter((c) => allow.has(c))),
    );
    // Trim + dedupe goals
    parsed.pcsp_goals = Array.from(
      new Set(parsed.pcsp_goals.map((g) => g.trim()).filter((g) => g.length > 2)),
    ).slice(0, 25);
    // Strip non-digits from Medicaid ID
    parsed.medicaid_id = parsed.medicaid_id.replace(/\D+/g, "");

    return parsed;
  });

// ---------- Commit: upsert into clients ----------

export const commitClientFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const c = data.client;

    // Try to find an existing client to update (match medicaid_id within org, else name)
    let existingId = c.id ?? null;
    if (!existingId && c.medicaid_id) {
      const { data: byMed } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("medicaid_id", c.medicaid_id)
        .limit(1)
        .maybeSingle();
      if (byMed?.id) existingId = byMed.id;
    }
    if (!existingId) {
      const { data: byName } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", data.organizationId)
        .ilike("first_name", c.first_name)
        .ilike("last_name", c.last_name)
        .limit(1)
        .maybeSingle();
      if (byName?.id) existingId = byName.id;
    }

    const payload = {
      organization_id: data.organizationId,
      first_name: c.first_name,
      last_name: c.last_name,
      medicaid_id: c.medicaid_id || null,
      pcsp_goals: c.pcsp_goals,
      job_code: c.authorized_codes,
      authorized_dspd_codes: c.authorized_codes,
      account_status: "active",
    };

    if (existingId) {
      const { error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", existingId);
      if (error) throw new Error(error.message);
      return { id: existingId, created: false };
    }

    const { data: ins, error } = await supabase
      .from("clients")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins!.id, created: true };
  });
