// NECTAR nutrition estimation — advisory, never authoritative.
// Given a meal name/description (optionally a recipe title), returns rough
// per-serving estimates for calories, protein, carbs, fat. If a value can't
// be reasonably estimated it is omitted (returned as null) — NEVER guessed.
// The client is expected to label these values as estimates until a manager
// overrides them.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const label: string = typeof body?.label === "string" ? body.label : "";
    const description: string = typeof body?.description === "string" ? body.description : "";
    const recipeName: string = typeof body?.recipe_name === "string" ? body.recipe_name : "";
    const servings: number | null =
      typeof body?.servings === "number" && body.servings > 0 ? body.servings : null;

    if (!label && !description && !recipeName) {
      return json({ estimates: {} });
    }

    const { gatewayFetch } = await import("../_shared/bedrock-fetch.ts");
    const aiRes = await gatewayFetch({
      messages: [
        {
          role: "system",
          content:
            "You are NECTAR's nutrition-estimation assistant for a Utah DSPD disability-services provider. " +
            "Given a meal, return conservative PER-SERVING estimates for calories (kcal), protein_g, carbs_g, and fat_g. " +
            "These are ROUGH ESTIMATES — the caller will label them as estimates until a human confirms. " +
            "If you cannot reasonably estimate a value from the information given, return null for that field. " +
            "Do NOT fabricate confident numbers. Do NOT include ingredients or preparation steps.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Meal label: ${label || "(none)"}\n` +
                `Description: ${description || "(none)"}\n` +
                `Recipe name: ${recipeName || "(none)"}\n` +
                `Servings basis: ${servings ?? 1} serving\n\n` +
                `Return one estimate per macro. Null if uncertain.`,
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_estimate",
            description: "Return per-serving nutrition estimates.",
            parameters: {
              type: "object",
              properties: {
                calories:  { type: ["number", "null"], description: "kcal per serving, or null if uncertain" },
                protein_g: { type: ["number", "null"] },
                carbs_g:   { type: ["number", "null"] },
                fat_g:     { type: ["number", "null"] },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                note: { type: "string", description: "Optional one-sentence caveat." },
              },
              required: ["calories", "protein_g", "carbs_g", "fat_g", "confidence"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_estimate" } },
      max_tokens: 300,
      temperature: 0.1,
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("nectar nutrition estimate error", aiRes.status, t);
      return json(
        { error: "Estimate unavailable", detail: t.slice(0, 400) },
        aiRes.status === 429 ? 429 : 502,
      );
    }
    const j = (await aiRes.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = call?.function?.arguments
      ? JSON.parse(call.function.arguments)
      : {};
    return json({ estimates: parsed });
  } catch (e) {
    console.error("estimate-meal-nutrition error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
