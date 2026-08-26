import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { gatewayFetch, assertBedrockConfigured } from "@/lib/ai-bedrock.server";

// ─── Compass — voice/shorthand note expansion (Phase 1) ─────────────────────
// Same Bedrock-via-gatewayFetch calling pattern as evaluateShiftNote in
// ai-coach.functions.ts. Unlike that coach call, this one wants a plain
// expanded note back — no JSON response_format, no JSON.parse.

interface ExpandInput {
  narrative: string;
  goals: string[];
  serviceCode: string;
  clientFirstName: string;
}

function validateExpand(input: unknown): ExpandInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const narrative = typeof i.narrative === "string" ? i.narrative.trim() : "";
  const goals = Array.isArray(i.goals)
    ? (i.goals as unknown[]).map((g) => String(g)).slice(0, 25)
    : [];
  const serviceCode = typeof i.serviceCode === "string" ? i.serviceCode.slice(0, 16) : "";
  const clientFirstName =
    typeof i.clientFirstName === "string" ? i.clientFirstName.slice(0, 80) : "the client";
  if (narrative.length === 0 || narrative.length > 8000) {
    throw new Error("Narrative must be 1–8000 characters.");
  }
  return { narrative, goals, serviceCode, clientFirstName };
}

export const expandShiftNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateExpand)
  .handler(async ({ data }): Promise<string> => {
    assertBedrockConfigured();

    const system = `You are Compass, the documentation assistant inside Cedar — a DSPD Medicaid compliance platform for Utah disability service providers. Your job is to expand a direct support professional's brief shift note into a complete, SOW-compliant progress note.

Rules:
- Write in first person from the staff member's perspective
- Minimum 60 words, maximum 250 words
- Reference specific PCSP goals by name when provided
- Include: what activities occurred, how the client responded, what staff support was provided, any notable behaviors or progress
- Never fabricate specific details not implied by the input
- Sound like a trained DSP wrote it — professional but not clinical
- No em-dashes, no AI-sounding filler phrases like "In today's session" or "It was observed that"
- Service code context: ${data.serviceCode} — structure the note appropriately for this service type
- Return only the expanded note text, no preamble or explanation`;

    const goalsText = data.goals.length > 0 ? data.goals.join("; ") : "not provided";
    const user = `Staff input: ${data.narrative}
Client first name: ${data.clientFirstName}
PCSP goals: ${goalsText}
Service code: ${data.serviceCode}

Expand this into a complete, compliant shift note.`;

    // Forward the incoming request's abort signal, same as callAI in
    // ai-coach.functions.ts, so a client-side cancellation actually stops
    // the Bedrock call.
    const res = await gatewayFetch(
      {
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { signal: getRequest()?.signal },
    );

    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (!res.ok) throw new Error(`AI error (${res.status}).`);

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const expanded = (json.choices?.[0]?.message?.content ?? "").trim();
    if (!expanded) {
      throw new Error(
        "Compass could not expand this note — please try again or write it manually.",
      );
    }
    return expanded;
  });
