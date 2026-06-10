// Format raw policy / person-specific text into the platform's training JSON
// shape using Lovable AI Gateway. Returns { title, intro, estMin, steps, attest }.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `You convert provider-supplied training content into a strict JSON object that drives the HIVE training player. The player renders lessons, knowledge checks, and a typed-name attestation gate. Follow this schema EXACTLY and output ONLY JSON (no prose, no code fences):

{
  "title": "string (concise module title)",
  "intro": "string (1-2 sentence plain-language overview)",
  "estMin": number (estimated minutes 5-30),
  "steps": [
    {
      "type": "lesson",
      "kicker": "Section N of M",
      "title": "string",
      "lead": "string (plain-language summary)",
      "callout": { "v": "info" | "warn" | "ok", "t": "short label", "b": "body text; <b>bold</b> allowed" },
      "facts": [ { "t": "fact label", "b": "fact body" } ],
      "dropHeading": "Go further",
      "drops": [ ["Section title", "Full original policy text shown when expanded"] ]
    },
    {
      "type": "check",
      "kicker": "Knowledge check N of M",
      "stem": "question",
      "options": [
        { "k": "A", "t": "option", "correct": false, "fb": "feedback if chosen" },
        { "k": "B", "t": "option", "correct": true,  "fb": "why this is correct" },
        { "k": "C", "t": "option", "correct": false, "fb": "feedback if chosen" }
      ]
    }
  ],
  "attest": "string (required attestation statement signed by staff)"
}

Rules:
- Break the source into 3-6 logical sections. Each section is a "lesson" step.
- For every "lesson", put the FULL original text inside "drops" so nothing is lost; the "lead" and "facts" are the plain-language summary.
- Add at least one "check" step per major section. Exactly one option must have correct: true.
- The "attest" string must clearly affirm the staff member has read and understood the content.
- Output VALID JSON only. No markdown. No commentary.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const body = await req.json().catch(() => ({}));
    const kind: "policies" | "person" = body.kind === "person" ? "person" : "policies";
    const personLabel: string | undefined = body.personLabel;
    const sourceText: string = String(body.sourceText ?? "").trim();
    if (sourceText.length < 30) return json({ error: "Source content is too short." }, 400);
    if (sourceText.length > 80_000) return json({ error: "Source content too long (max ~80k characters)." }, 400);

    const userPrompt =
      kind === "person"
        ? `Format this person-specific support information into a training module for staff who support ${personLabel ?? "this person"}. Keep identifying details accurate. Source content:\n\n${sourceText}`
        : `Format these agency policies & procedures into a staff training module. Source content:\n\n${sourceText}`;

    const { gatewayFetch } = await import("../_shared/bedrock-fetch.ts");
    const aiRes = await gatewayFetch({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
    });

    if (aiRes.status === 429) return json({ error: "Rate limited. Try again in a moment." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted. Please add credits in workspace settings." }, 402);
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json({ error: `AI gateway error (${aiRes.status})`, detail: txt.slice(0, 500) }, 500);
    }

    const raw = await aiRes.json();
    const content: string = raw?.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // strip code fences if AI ignored instructions
      const cleaned = content.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    // Minimal shape validation / defaults
    if (!parsed || typeof parsed !== "object") return json({ error: "AI returned invalid output." }, 502);
    parsed.title = String(parsed.title ?? "Training Module").slice(0, 200);
    parsed.intro = String(parsed.intro ?? "");
    parsed.estMin = Math.max(3, Math.min(60, Number(parsed.estMin ?? 10) || 10));
    parsed.steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    parsed.attest = String(
      parsed.attest ??
        "I attest that I have read and understood this training material and will apply it in my role.",
    );

    return json({ module: parsed });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
